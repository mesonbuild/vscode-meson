import * as vscode from "vscode";

import type { Executable } from "vscode-languageclient/node.js";
import { LanguageServerClient } from "../lsp/index.js";

export class MuonLanguageClient extends LanguageServerClient {
  get runExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["analyze", "lsp"],
    };
  }

  get debugExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: ["analyze", "lsp"],
    };
  }

  constructor(languageServerPath: vscode.Uri, context: vscode.ExtensionContext, referenceVersion: string) {
    super("muon", languageServerPath, context, referenceVersion);
  }
}
