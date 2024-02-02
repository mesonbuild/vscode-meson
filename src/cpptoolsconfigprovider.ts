import * as vscode from "vscode";
import * as cpptools from "vscode-cpptools";
import { getMesonBuildOptions, getMesonCompilers, getMesonDependencies } from "./introspection";

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
      compilerPath: "",
      compilerArgs: [],
      standard: "c++17",
    };

    const dependencies = await getMesonDependencies(this.buildDir);
    for (const dep of dependencies) {
      if (dep.compile_args) {
        for (const arg of dep.compile_args) {
          if (arg.startsWith("-I")) {
            browseConfig.browsePath.push(arg.slice(2));
          }
        }
      }
    }
    // The cpptools API requires at least one browse path, even when we provide a compiler path.
    if (browseConfig.browsePath.length === 0) {
      browseConfig.browsePath.push("");
    }

    let machine = "";
    const buildOptions = await getMesonBuildOptions(this.buildDir);
    for (const option of buildOptions) {
      if (option.name === "cpp_std") {
        browseConfig = Object.assign({}, browseConfig, { standard: option.value });
        machine = option.machine;
      }
    }

    const compilers = await getMesonCompilers(this.buildDir);
    const compiler = compilers[machine];
    if (compiler && compiler["cpp"]) {
      const compilerDesc = compiler["cpp"];
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
