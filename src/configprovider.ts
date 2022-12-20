import * as vscode from "vscode";

import {
  getMesonTargets
} from "./meson/introspection"
import {
  extensionConfiguration,
    getBuildFolder,
    getTargetName2
} from "./utils"

export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private path: string;

  constructor(path: string) {
    this.path = path
  }

  async provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration[]> {
    let targets = await getMesonTargets(this.path);

    let configDebugOptions = extensionConfiguration("debugOptions");

    const executables = targets.filter(target => target.type == "executable");
    let ret: vscode.DebugConfiguration[] = [];

    for (const target of executables) {
      if (!target.target_sources.some(source => ['cpp', 'c'].includes(source.language))) {
        continue;
      }

      // TODO buildDir support.
      const targetName = await getTargetName2(folder, getBuildFolder(), target)
      let debugConfiguration = {
        type: 'cppdbg',
        name: target.name,
        request: "launch",
        cwd: this.path,
        program: target.filename[0],
        preLaunchTask: `Meson: Build ${targetName}`
      };

      ret.push({ ...configDebugOptions, ...debugConfiguration })
    }

    return ret;
  }

  resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, debugConfiguration: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
    return debugConfiguration
  }

  resolveDebugConfigurationWithSubstitutedVariables(folder: vscode.WorkspaceFolder, debugConfiguration: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
    return debugConfiguration
  }

}
