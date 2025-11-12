import * as os from "node:os";
import * as vscode from "vscode";
import * as path from "node:path";
import { getMesonTargets } from "../introspection.js";
import { Target } from "../types.js";
import { extensionConfiguration, getTargetName } from "../utils.js";

export enum DebuggerType {
  cppvsdbg = "cppvsdbg",
  cppdbg = "cppdbg",
  lldb = "lldb",
  lldbDAP = "lldb-dap",
}

enum MIMode {
  gdb = "gdb",
  lldb = "lldb",
}

export class MesonDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  readonly type: DebuggerType;
  private readonly path: string;

  constructor(type: DebuggerType, path: string) {
    this.type = type;
    this.path = path;
  }

  async createDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    return await this.createDebugConfigurationForType(target, this.type);
  }

  async provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
    token?: vscode.CancellationToken,
  ): Promise<vscode.DebugConfiguration[]> {
    const targets = await getMesonTargets(this.path);
    const configDebugOptions = extensionConfiguration("debugOptions");
    const executables = targets.filter(
      (target) =>
        target.type === "executable" && target.target_sources?.some((source) => ["cpp", "c"].includes(source.language)),
    );

    return Promise.all(
      executables.map(async (target) => {
        const targetDebugConfiguation = await this.createDebugConfiguration(target);
        return { ...configDebugOptions, ...targetDebugConfiguation };
      }),
    );
  }

  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    debugConfiguration: vscode.DebugConfiguration,
    token?: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    return debugConfiguration;
  }

  resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder,
    debugConfiguration: vscode.DebugConfiguration,
    token?: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    return debugConfiguration;
  }

  async createDebugConfigurationForType(target: Target, type: DebuggerType): Promise<vscode.DebugConfiguration> {
    const targetName = await getTargetName(target);
    const name = type.toString();
    let debugConfig: vscode.DebugConfiguration = {
      type: name,
      name: `Debug ${target.name} (${name})`,
      request: "launch",
      cwd: path.dirname(this.path),
      program: target.filename[0],
      args: [],
      preLaunchTask: `Meson: Build ${targetName}`,
    };

    if (type === DebuggerType.cppdbg) {
      let miMode;
      if (os.platform() === "darwin") {
        miMode = MIMode.lldb;
      } else {
        miMode = MIMode.gdb;
      }
      debugConfig["MIMode"] = miMode.toString();

      if (miMode === MIMode.gdb) {
        debugConfig["setupCommands"] = [
          {
            description: "Enable pretty-printing for gdb",
            text: "-enable-pretty-printing",
            ignoreFailures: true,
          },
        ];
      }
    }
    return debugConfig;
  }
}
