import * as vscode from "vscode";
import * as path from "path";
import { getMesonTargets } from "../introspection";
import { Target } from "../types";
import { extensionConfiguration, getTargetName } from "../utils";

export abstract class MesonDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  abstract getName(): string;

  async createDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    const targetName = await getTargetName(target);
    const name = this.getName();
    return {
      type: name,
      name: `Debug ${target.name} (${name})`,
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
    const targets = await getMesonTargets(this.path);

    const configDebugOptions = extensionConfiguration("debugOptions");

    const executables = targets.filter((target) => target.type == "executable");
    let ret: vscode.DebugConfiguration[] = [];

    for (const target of executables) {
      if (!target.target_sources?.some((source) => ["cpp", "c"].includes(source.language))) {
        continue;
      }

      const debugConfiguration = await this.createDebugConfiguration(target);
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
