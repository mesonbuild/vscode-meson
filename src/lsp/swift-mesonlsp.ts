import * as os from "os";
import * as vscode from "vscode";

import { LanguageServerClient } from "../lsp";
import { Executable } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "Swift-MesonLSP-win64.zip",
      hash: "58cfb17b1804a17886ff5a6a0db668e74c4622cedae077feca884e20567aec7c",
    },
    "darwin-x64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "7f1b51b7bbecc6ba5b569177b39086b5a761e4d34e1bb2d659b97d46c110f078",
    },
    "linux-x64": {
      name: "Swift-MesonLSP.zip",
      hash: "72ee4b630135165159237047d37bafd53bb42107528250ce59cd5e650d387ee0",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  static override setupURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs";
  static override version: string = "2.4.3";

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

  constructor(languageServerPath: vscode.Uri, context: vscode.ExtensionContext) {
    super("Swift-MesonLSP", languageServerPath, context);
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
