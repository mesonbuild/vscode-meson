import * as vscode from "vscode";
import * as path from 'path';
import {
  getMesonTargets
} from "./meson/introspection"
import {
  Target
} from "./meson/types"
import {
  extensionConfiguration,
  getTargetName
} from "./utils"

export enum MIModes {
  lldb = 'lldb',
  gdb = 'gdb',
}

export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  private path: string;

  constructor(path: string) {
    this.path = path
  }

  async createBaseDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    const targetName = await getTargetName(target);
    return {
      type: 'cppdbg',
      name: `Debug ${target.name}`,
      request: 'launch',
      cwd: path.dirname(this.path),
      program: target.filename[0],
      args: [],
      preLaunchTask: `Meson: Build ${targetName}`
    };
  }

  async createGDBDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    let debugConfig = await this.createBaseDebugConfiguration(target);
    debugConfig.MIMode = MIModes.gdb;
    debugConfig.setupCommands = [{
      description: 'Enable pretty-printing for gdb',
      text: '-enable-pretty-printing',
      ignoreFailures: true
    }];
    return debugConfig;
  }

  async createLLDBDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    let debugConfig = await this.createBaseDebugConfiguration(target);
    debugConfig.MIMode = MIModes.lldb;
    return debugConfig;
  }

  async createMSVCDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    let debugConfig = await this.createBaseDebugConfiguration(target);
    debugConfig.type = 'cppvsdbg';
    return debugConfig;
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

      let debugConfiguration = null;
      if (target.target_sources.some(source => ['cl'].includes(source.compiler[0]))) {
        debugConfiguration = await this.createMSVCDebugConfiguration(target);
      } else if (target.target_sources.some(source => ['cc', 'clang'].includes(source.compiler[0]))) {
        debugConfiguration = await this.createLLDBDebugConfiguration(target);
      } else {
        debugConfiguration = await this.createGDBDebugConfiguration(target);
      }

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
