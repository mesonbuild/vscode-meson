import * as vscode from "vscode";

import type { Executable } from "vscode-languageclient/node.js";
import { LanguageServerClient } from "../lsp/index.js";

export class MuonLanguageClient extends LanguageServerClient {
  get runExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: [...this.extraArgs, "analyze", "lsp"],
    };
  }

  get debugExe(): Executable {
    return {
      command: this.languageServerPath!.fsPath,
      args: [...this.extraArgs, "analyze", "lsp"],
    };
  }

  constructor(
    languageServerPath: vscode.Uri,
    extraArgs: string[],
    context: vscode.ExtensionContext,
    referenceVersion: string,
  ) {
    super("muon", languageServerPath, extraArgs, context, referenceVersion);
  }
}
