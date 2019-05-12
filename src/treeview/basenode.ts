import * as vscode from "vscode";

export class BaseNode {
  constructor(public readonly id: string) {}
  getChildren(): vscode.ProviderResult<BaseNode[]> {
    return [];
  }
  getTreeItem(): vscode.ProviderResult<vscode.TreeItem> {
    const item = new vscode.TreeItem(this.id);
    item.id = this.id;
    item.label = this.id;
    return item;
  }
}
