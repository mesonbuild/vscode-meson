//# #if HAVE_VSCODE
import * as vscode from "vscode";
//# #elif HAVE_COC_NVIM
//# import * as vscode from "coc.nvim";
//# import { resolve } from "path";
//# #endif

export enum Location {
  LSP = "lsp",
}

export function uri(location: Location, context: vscode.ExtensionContext): vscode.Uri {
  //# #if HAVE_VSCODE
  return vscode.Uri.joinPath(context.globalStorageUri, location);
  //# #elif HAVE_COC_NVIM
  //# return vscode.Uri.file(resolve(context.storagePath, location));
  //# #endif
}
