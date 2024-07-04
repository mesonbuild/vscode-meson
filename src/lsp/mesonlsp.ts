import * as os from "os";
import * as vscode from "vscode";

import { Executable } from "vscode-languageclient/node";
import { LanguageServerClient } from "../lsp";

export class MesonLSPLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "mesonlsp-x86_64-pc-windows-gnu.zip",
      hash: "2f5867ddab9579c38167fcdcd1e928ef5efaf2189079da34bbc3ce34c62eb6ac",
    },
    "darwin-x64": {
      name: "mesonlsp-x86_64-apple-darwin.zip",
      hash: "65c7da0a7dbd60656a06492221b43a6a62d304d90241b1294a94dc17e01b599f",
    },
    "darwin-arm64": {
      name: "mesonlsp-aarch64-apple-darwin.zip",
      hash: "ac124172c7283496a3d9411de344229846eab9e57ab0858398d7a801ae0d9018",
    },
    "linux-x64": {
      name: "mesonlsp-x86_64-unknown-linux-musl.zip",
      hash: "609115354e352296e56948adfdee8c93ab597396a2c6b55837dd201f670df7b4",
    },
    "linux-arm64": {
      name: "mesonlsp-aarch64-unknown-linux-musl.zip",
      hash: "338226c3033c0b2d66bc0ad959f6cb197801ebe20d78a8c828f45feba616731b",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/mesonlsp";
  static override setupURL: string = "https://github.com/JCWasmx86/mesonlsp/tree/main/docs";
  static override version: string = "4.3.0";

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
