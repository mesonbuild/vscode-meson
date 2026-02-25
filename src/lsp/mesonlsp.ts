import * as os from "node:os";
import * as vscode from "vscode";

import { Executable } from "vscode-languageclient/node.js";
import { LanguageServerClient } from "../lsp/index.js";

export class MesonLSPLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "darwin-arm64": {
      name: "mesonlsp-aarch64-apple-darwin.zip",
      hash: "0ebdeccf2102be476e2994cd9d2a452f29d21b6d95f171f7827375105dfab192",
    },
    "linux-arm64": {
      name: "mesonlsp-aarch64-unknown-linux-musl.zip",
      hash: "b0f33bc4a2c289b2125eb4d046c2705c4404a212468d5f230f7509e8cc9a7f1a",
    },
    "darwin-x64": {
      name: "mesonlsp-x86_64-apple-darwin.zip",
      hash: "7eed8125295ac616d7d4c12f6b814fa057c30f3fe192e4e6d86fb174ef6b1b6a",
    },
    "win32-x64": {
      name: "mesonlsp-x86_64-pc-windows-gnu.zip",
      hash: "aaee43dba4dbbf25c530a382097230edce1cb9590b245083af56005994ed9f7a",
    },
    "linux-x64": {
      name: "mesonlsp-x86_64-unknown-linux-musl.zip",
      hash: "279d6d12fca6d7102be57b95be3803eeebeef800c6e31d871b771dd7d5fc9a99",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/mesonlsp";
  static override setupURL: string = "https://github.com/JCWasmx86/mesonlsp/tree/main/docs";
  static override version: string = "4.3.3";

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

    if (arch !== "x64" && slug != "darwin-arm64" && slug != "linux-arm64") return null;

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
      case "linux":
      case "darwin":
        // x64 and ARM are supported.
        return true;
      case "win32":
        // Currently no support for ARM Windows.
        return arch == "x64";
      default:
        return false;
    }
  }
}
