import * as vscode from "vscode";

import {
    getMesonTargets
} from "./meson/introspection"
import {
    getTargetName
} from "./utils"

export class DebugConfigurationProvider implements vscode.DebugConfigurationProvider {
    private path: string;

    constructor(path: string) {
        this.path = path
    }

    async provideDebugConfigurations(folder: vscode.WorkspaceFolder | undefined, token?: vscode.CancellationToken): Promise<vscode.DebugConfiguration[]> {
        let targets = await getMesonTargets(this.path);

        const executables = targets.filter(target => target.type == "executable");
        let ret: vscode.DebugConfiguration[] = [];

        for (const target of executables) {
            if (!target.target_sources.some(source => ['cpp', 'c'].includes(source.language))) {
                continue;
            }

            const targetName = await getTargetName(target)
            ret.push({
                type: 'cppdbg',
                name: target.name,
                request: "launch",
                cwd: this.path,
                program: target.filename[0],
                preLaunchTask: `Meson: Build ${targetName}`
            })
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