import * as vscode from "vscode";
import * as path from "path";
import { getMesonTargets } from "./introspection";
import { Target } from "./types";
import { extensionConfiguration, getTargetName } from "./utils";

export class DebugConfigurationProviderLldb implements vscode.DebugConfigurationProvider {
  static readonly type = "lldb";

  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  async createDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    const targetName = await getTargetName(target);
    return {
      type: DebugConfigurationProviderLldb.type,
      name: `Debug ${target.name} (lldb)`,
      request: "launch",
      cwd: path.dirname(this.path),
      program: target.filename[0],
      args: [],
      preLaunchTask: `Meson: Build ${targetName}`,
    };
  }

  async provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
    token?: vscode.CancellationToken,
  ): Promise<vscode.DebugConfiguration[]> {
    let targets = await getMesonTargets(this.path);

    let configDebugOptions = extensionConfiguration("debugOptions");

    const executables = targets.filter((target) => target.type == "executable");
    let ret: vscode.DebugConfiguration[] = [];

    for (const target of executables) {
      if (!target.target_sources?.some((source) => ["cpp", "c"].includes(source.language))) {
        continue;
      }

      let debugConfiguration = await this.createDebugConfiguration(target);
      ret.push({ ...configDebugOptions, ...debugConfiguration });
    }

    return ret;
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
}
