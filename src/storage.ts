import * as vscode from "vscode";

export enum Location {
  LSP = "lsp",
}

export function uri(location: Location, context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, location);
}
