import * as path from "path";
import * as vscode from "vscode";
import { isThenable } from "../../utils";
import { BaseNode } from "../basenode";

export abstract class BaseDirectoryNode<T> extends BaseNode {
  subfolders: Thenable<Map<string, T[]>>;

  constructor(id: string, protected readonly folder: string, protected readonly filepaths: T[]) {
    super(id);

    const subs = this.buildFileTree(filepaths);
    if (isThenable(subs)) {
      this.subfolders = subs;
    } else {
      this.subfolders = Promise.resolve(subs);
    }
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = path.basename(this.folder);
    // item.resourceUri = vscode.Uri.file(this.folder);
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  abstract buildFileTree(fpaths: T[]): vscode.ProviderResult<Map<string, T[]>>;
}
