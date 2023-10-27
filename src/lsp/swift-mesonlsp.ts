import * as os from "os";
import * as vscode from "vscode";

import { LanguageServerClient } from "../lsp";
import { Executable } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "Swift-MesonLSP-win64.zip",
      hash: "2d97edb0a51c27a51f23e5ea1399e4bc9fa272abb9c1e11e247f129af8c97fe4",
    },
    "darwin-x64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "138262bf74a214a2bec737d7058d64a9212d92a764a3d034672c0d223058d440",
    },
    "linux-x64": {
      name: "Swift-MesonLSP.zip",
      hash: "2c04e926fdff84aa776083f805180709571718f7f6d0430868ba8bcf9298a0d7",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  static override setupURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs";
  static override version: string = "v3.0.19";

  get runExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["--lsp"],
    };
  }

  get debugExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["--lsp"],
    };
  }

  constructor(languageServerPath: vscode.Uri, context: vscode.ExtensionContext, referenceVersion: string) {
    super("Swift-MesonLSP", languageServerPath, context, referenceVersion);
  }

  static override artifact(): { url: string; hash: string } | null {
    const arch = os.arch();
    const platform = os.platform();
    if (arch !== "x64") return null;

    const artifact = SwiftMesonLspLanguageClient.artifacts[`${platform}-${arch}`];
    return {
      url: `${SwiftMesonLspLanguageClient.repoURL}/releases/download/v${SwiftMesonLspLanguageClient.version}/${artifact.name}`,
      hash: artifact.hash,
    };
  }

  static override supportsSystem(): boolean {
    const arch = os.arch();
    if (arch != "x64") return false;

    const platform = os.platform();
    switch (platform) {
      case "darwin":
      case "linux":
      case "win32":
        return true;
      default:
        return false;
    }
  }
}
