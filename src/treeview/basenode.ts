import * as vscode from "vscode";

import { hash } from "../utils";

export abstract class BaseNode {
  constructor(protected readonly id: string) { }

  getChildren(): vscode.ProviderResult<BaseNode[]> {
    return [];
  }

  getTreeItem(): vscode.ProviderResult<vscode.TreeItem> {
    // All derived getTreeItem()s set an appropriate label.
    const item = new vscode.TreeItem("");

    item.id = hash(this.id);

    return item;
  }
}
