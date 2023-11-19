import * as os from "os";
import * as vscode from "vscode";

import { LanguageServerClient } from "../lsp";
import { Executable } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "Swift-MesonLSP-win64.zip",
      hash: "6da9a3eafc57f2d7ba08765c497501e68e3eae29f479dcdfef157bfff8720353",
    },
    "darwin-x64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "59d4d83443b13e8bab32437fb3bb9624e04ff058ae46684ed5debba13df7ad18",
    },
    "darwin-arm64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "59d4d83443b13e8bab32437fb3bb9624e04ff058ae46684ed5debba13df7ad18",
    },
    "linux-x64": {
      name: "Swift-MesonLSP.zip",
      hash: "5438e83a934ac4fd8e77db4c7269450d32e7863eb417c63ef2b10a57906b577c",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  static override setupURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs";
  static override version: string = "3.1.2";

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
    const slug = `${platform}-${arch}`;

    if (arch !== "x64" && slug != "darwin-arm64") return null;

    const artifact = SwiftMesonLspLanguageClient.artifacts[slug];
    return {
      url: `${SwiftMesonLspLanguageClient.repoURL}/releases/download/v${SwiftMesonLspLanguageClient.version}/${artifact.name}`,
      hash: artifact.hash,
    };
  }

  static override supportsSystem(): boolean {
    const arch = os.arch();
    if (arch != "x64" && arch != "arm64") return false;

    const platform = os.platform();
    switch (platform) {
      case "darwin":
        // x64 and ARM are supported thanks to universal binaries.
        return true;
      case "linux":
      case "win32":
        // Currently no support for ARM on other operating systems.
        return arch == "x64";
      default:
        return false;
    }
  }
}
