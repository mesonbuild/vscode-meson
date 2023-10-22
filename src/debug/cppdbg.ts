import * as vscode from "vscode";
import { Target } from "../types";
import { MesonDebugConfigurationProvider } from ".";

export class DebugConfigurationProviderCppdbg extends MesonDebugConfigurationProvider {
  constructor(path: string) {
    super(path);
  }

  override getName(): string {
    return "cppdbg";
  }

  override async createDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    let debugConfiguration = null;
    if (target.target_sources?.some((source) => ["cl"].includes(source.compiler[0]))) {
      debugConfiguration = await this.createMSVCDebugConfiguration(target);
    } else if (target.target_sources?.some((source) => ["cc", "clang"].includes(source.compiler[0]))) {
      debugConfiguration = await this.createLLDBDebugConfiguration(target);
    } else {
      debugConfiguration = await this.createGDBDebugConfiguration(target);
    }
    return debugConfiguration;
  }

  async createGDBDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    const debugConfig = await super.createDebugConfiguration(target);
    debugConfig["MIMode"] = "gdb";
    debugConfig["setupCommands"] = [
      {
        description: "Enable pretty-printing for gdb",
        text: "-enable-pretty-printing",
        ignoreFailures: true,
      },
    ];
    return debugConfig;
  }

  async createLLDBDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    const debugConfig = await super.createDebugConfiguration(target);
    debugConfig["MIMode"] = "lldb";
    return debugConfig;
  }

  async createMSVCDebugConfiguration(target: Target): Promise<vscode.DebugConfiguration> {
    const debugConfig = await super.createDebugConfiguration(target);
    debugConfig.type = "cppvsdbg";
    return debugConfig;
  }
}
