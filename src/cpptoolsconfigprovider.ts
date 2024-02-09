import * as vscode from "vscode";
import * as cpptools from "vscode-cpptools";
import { getMesonBuildOptions, getMesonCompilers, getMesonDependencies } from "./introspection";
import { getOutputChannel } from "./utils";
import { Compiler, Dependencies } from "./types";

export class CpptoolsProvider implements cpptools.CustomConfigurationProvider {
  cppToolsAPI?: cpptools.CppToolsApi;
  private buildDir: string;

  constructor(buildDir: string) {
    this.buildDir = buildDir;
  }

  name = "Meson Build";
  extensionId = "mesonbuild.mesonbuild";

  canProvideBrowseConfiguration(token?: vscode.CancellationToken | undefined): Thenable<boolean> {
    return new Promise<boolean>((resolve) => {
      if (this.buildDir !== "") {
        resolve(true);
      } else {
        // Wait for this.buildDir to not be ""
        const interval = setInterval(() => {
          if (this.buildDir !== "") {
            clearInterval(interval);
            this.refresh(this.buildDir);
            resolve(true);
          }
        }, 100);
      }
    });
  }

  async provideBrowseConfiguration(
    token?: vscode.CancellationToken | undefined,
  ): Promise<cpptools.WorkspaceBrowseConfiguration | null> {
    let browseConfig: cpptools.WorkspaceBrowseConfiguration = {
      browsePath: [],
      compilerPath: "${default}",
      compilerArgs: [],
    };

    const dependencies = await getMesonDependencies(this.buildDir);
    browseConfig = Object.assign(browseConfig, { browsePath: this.getDependenciesIncludeDirs(dependencies) });

    let machine = "";
    const buildOptions = await getMesonBuildOptions(this.buildDir);
    for (const option of buildOptions) {
      if (option.name === "cpp_std") {
        if (option.value != "none") browseConfig = Object.assign({}, browseConfig, { standard: option.value });
        machine = option.machine;
      } else if (machine === "" && option.name === "c_std") {
        // C++ takes precedence
        if (option.value != "none") browseConfig = Object.assign({}, browseConfig, { standard: option.value });
        machine = option.machine;
      }
    }

    try {
      const compilers = await getMesonCompilers(this.buildDir);
      const compiler = compilers[machine];
      if (compiler && compiler["cpp"]) {
        browseConfig = this.setCompilerArgs(compiler, "cpp", browseConfig);
      } else if (compiler && compiler["c"]) {
        browseConfig = this.setCompilerArgs(compiler, "c", browseConfig);
      }
    } catch (e) {
      getOutputChannel().appendLine(
        `Could not introspect a specific compiler, the default one will be used: ${JSON.stringify(e)}`,
      );
    }

    getOutputChannel().appendLine(`Providing cpptools configuration: ${JSON.stringify(browseConfig)}`);
    return browseConfig;
  }

  private getDependenciesIncludeDirs(dependencies: Dependencies) {
    let includeDirs: string[] = [];
    for (const dep of dependencies) {
      if (dep.compile_args) {
        for (const arg of dep.compile_args) {
          if (arg.startsWith("-I")) {
            includeDirs.push(arg.slice(2));
          }
        }
      }
    }
    // The cpptools API requires at least one browse path, even when we provide a compiler path.
    if (includeDirs.length === 0) {
      includeDirs.push("");
    }
    return includeDirs;
  }

  private setCompilerArgs(
    compiler: Compiler,
    standard: string,
    browseConfig: cpptools.WorkspaceBrowseConfiguration,
  ): cpptools.WorkspaceBrowseConfiguration {
    if (compiler[standard]) {
      const compilerDesc = compiler[standard];
      browseConfig = Object.assign({}, browseConfig, {
        compilerPath: compilerDesc.exelist[0],
        compilerArgs: compilerDesc.exelist.slice(1),
      });
    }
    return browseConfig;
  }

  // We only handle project-wide configurations.
  canProvideBrowseConfigurationsPerFolder(token?: vscode.CancellationToken | undefined): Thenable<boolean> {
    return Promise.resolve(false);
  }

  async provideFolderBrowseConfiguration(
    uri: vscode.Uri,
    token?: vscode.CancellationToken | undefined,
  ): Promise<cpptools.WorkspaceBrowseConfiguration | null> {
    return null;
  }

  // We only handle project-wide configurations.
  canProvideConfiguration(uri: vscode.Uri, token?: vscode.CancellationToken | undefined): Thenable<boolean> {
    return Promise.resolve(false);
  }

  async provideConfigurations(
    uris: vscode.Uri[],
    token?: vscode.CancellationToken | undefined,
  ): Promise<cpptools.SourceFileConfigurationItem[]> {
    return [];
  }

  dispose() {}

  refresh(buildDir: string) {
    this.buildDir = buildDir;
    this.cppToolsAPI?.notifyReady(this);
    this.cppToolsAPI?.didChangeCustomConfiguration(this);
    this.cppToolsAPI?.didChangeCustomBrowseConfiguration(this);
  }
}

// Official implementation from https://classic.yarnpkg.com/en/package/vscode-cpptools
export async function registerCppToolsProvider(
  ctx: vscode.ExtensionContext,
  provider: CpptoolsProvider,
): Promise<cpptools.CppToolsApi | undefined> {
  const cppToolsAPI = await cpptools.getCppToolsApi(cpptools.Version.latest);
  if (cppToolsAPI) {
    provider.cppToolsAPI = cppToolsAPI;
    if (cppToolsAPI.notifyReady) {
      cppToolsAPI.registerCustomConfigurationProvider(provider);
      cppToolsAPI.notifyReady(provider);
      ctx.subscriptions.push(cppToolsAPI);
    } else {
      throw new Error("CppTools API not available, or not version >2.0");
    }
  }
  return cppToolsAPI;
}
