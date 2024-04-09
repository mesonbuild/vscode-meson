import * as os from "os";
import * as vscode from "vscode";

import { Executable } from "vscode-languageclient/node";
import { LanguageServerClient } from "../lsp";

export class MesonLSPLanguageClient extends LanguageServerClient {
  private static artifacts: { [key: string]: { name: string; hash: string } } = {
    "win32-x64": {
      name: "mesonlsp-x86_64-pc-windows-gnu.zip",
      hash: "307078efdc91ead3bb86850c4438547dd94f98d2403937d9aab47d318421e866",
    },
    "darwin-x64": {
      name: "mesonlsp-x86_64-apple-darwin.zip",
      hash: "c93129b5a331e1ee29e2241e262564808ed523e43bc2b00d1512ff04ca9c77e7",
    },
    "darwin-arm64": {
      name: "mesonlsp-aarch64-apple-darwin.zip",
      hash: "12ec62cb5c2a852b9f99e2844fc350a22d62519d4aab1b757e99f116a0b84680",
    },
    "linux-x64": {
      name: "mesonlsp-x86_64-unknown-linux-musl.zip",
      hash: "055ab2d2fa0328c9d5c41f918b4a8c44b196232a1eef22384ef8073d81be945b",
    },
  };

  static override repoURL: string = "https://github.com/JCWasmx86/mesonlsp";
  static override setupURL: string = "https://github.com/JCWasmx86/mesonlsp/tree/main/docs";
  static override version: string = "4.1.8";

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
