import * as os from "os";
import * as vscode from "vscode";

import { Executable } from "vscode-languageclient/node";
import { LanguageServerClient } from "../lsp";

export class MesonLSPLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "mesonlsp-x86_64-pc-windows-gnu.zip",
      hash: "86b4eb62dcbcabeafdf9ab0b4a9740ab3c2b6900410eb932b0af9fc72960beae",
    },
    "darwin-x64": {
      name: "mesonlsp-x86_64-apple-darwin.zip",
      hash: "8d2352f1234ce4f6fdf6ca95cf5244fba07fa54bbb3631cdce54b6a08971947d",
    },
    "darwin-arm64": {
      name: "mesonlsp-aarch64-apple-darwin.zip",
      hash: "721502b125a9d87e4a1a8f0be5ba89b85461569935c70b1bae459a678aed45bd",
    },
    "linux-x64": {
      name: "mesonlsp-x86_64-unknown-linux-musl.zip",
      hash: "639c5aef2078a464c8e870d046e33fc501d9407c21f3f2ff8054e7b708ec6962",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/mesonlsp";
  static override setupURL: string = "https://github.com/JCWasmx86/mesonlsp/tree/main/docs";
  static override version: string = "4.1.3";

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
    super("mesonlsp", languageServerPath, context, referenceVersion);
  }

  static override artifact(): { url: string; hash: string } | null {
    const arch = os.arch();
    const platform = os.platform();
    const slug = `${platform}-${arch}`;

    if (arch !== "x64" && slug != "darwin-arm64") return null;

    const artifact = MesonLSPLanguageClient.artifacts[slug];
    return {
      url: `${MesonLSPLanguageClient.repoURL}/releases/download/v${MesonLSPLanguageClient.version}/${artifact.name}`,
      hash: artifact.hash,
    };
  }

  static override supportsSystem(): boolean {
    const arch = os.arch();
    if (arch != "x64" && arch != "arm64") return false;

    const platform = os.platform();
    switch (platform) {
      case "darwin":
        // x64 and ARM are supported.
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
