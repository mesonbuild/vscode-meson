import * as os from "os";
import * as vscode from "vscode";

import { LanguageServerClient } from "../lsp";
import { Executable } from "vscode-languageclient/node";

export class SwiftMesonLspLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "Swift-MesonLSP-win64.zip",
      hash: "393c4e7c1ed588e61940cdca5201e115e223727fcb578627b15e719b9783e08f",
    },
    "darwin-x64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "f94e0e51806e7630e94f9dee21240a94f0269f75ebbf44a5a72e064c50cd8155",
    },
    "darwin-arm64": {
      name: "Swift-MesonLSP-macos12.zip",
      hash: "f94e0e51806e7630e94f9dee21240a94f0269f75ebbf44a5a72e064c50cd8155",
    },
    "linux-x64": {
      name: "Swift-MesonLSP.zip",
      hash: "aef1f6b386e517ac31e58286b25c6bd828ad1fc1e6958a18d5cd52a868bdf1aa",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP";
  static override setupURL: string = "https://github.com/JCWasmx86/Swift-MesonLSP/tree/main/Docs";
  static override version: string = "3.1.3";
  static override executableNames: string[] = ["Swift-MesonLSP"];

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
