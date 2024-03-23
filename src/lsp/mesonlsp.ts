import * as os from "os";
import * as vscode from "vscode";

import { Executable } from "vscode-languageclient/node";
import { LanguageServerClient } from "../lsp";

export class MesonLSPLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "mesonlsp-x86_64-pc-windows-gnu.zip",
      hash: "81133a14b018d35e874d08c17a680781014f67c3599ed9ff54f8b5a368f8651e",
    },
    "darwin-x64": {
      name: "mesonlsp-x86_64-apple-darwin.zip",
      hash: "6c66263255a6110b2bcf9a6d9c80a8562e7cbad39f55d7f556df4027bebef6e5",
    },
    "darwin-arm64": {
      name: "mesonlsp-aarch64-apple-darwin.zip",
      hash: "651aff60cc58b4e6f7c06435364a4e8c749eb4854921119ca428a710256d0474",
    },
    "linux-x64": {
      name: "mesonlsp-x86_64-unknown-linux-musl.zip",
      hash: "ec073841562e544296694b3c7d54d141098faaa05529dbad45561d26c325705a",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/mesonlsp";
  static override setupURL: string = "https://github.com/JCWasmx86/mesonlsp/tree/main/docs";
  static override version: string = "4.1.2";

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
