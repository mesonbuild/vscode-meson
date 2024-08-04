import * as os from "os";
import * as vscode from "vscode";

import { Executable } from "vscode-languageclient/node";
import { LanguageServerClient } from "../lsp";

export class MesonLSPLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "mesonlsp-x86_64-pc-windows-gnu.zip",
      hash: "b5d6c1f414a938ccaacc93cdb2bc2f7f126da7fe52e99e25d8f94b60ac82ca56",
    },
    "darwin-x64": {
      name: "mesonlsp-x86_64-apple-darwin.zip",
      hash: "0da55be0ab6e178bf8953808db4333521d6694bcc78c2ea8b41f3907f133d3b2",
    },
    "darwin-arm64": {
      name: "mesonlsp-aarch64-apple-darwin.zip",
      hash: "c8bc02ffca66d0a1bef972e5f884005cc72efe79347fbe35a44da55c53c01de3",
    },
    "linux-x64": {
      name: "mesonlsp-x86_64-unknown-linux-musl.zip",
      hash: "76dcd3b5a04dc4bcbfb1d2c706e755738eb1eb3ab611006285902e544b6ab6b0",
    },
    "linux-arm64": {
      name: "mesonlsp-aarch64-unknown-linux-musl.zip",
      hash: "29db76675e02f33b70c18a8088c39c365b7c315509bd176ce32958a2c25eb442",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/mesonlsp";
  static override setupURL: string = "https://github.com/JCWasmx86/mesonlsp/tree/main/docs";
  static override version: string = "4.3.2";

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
