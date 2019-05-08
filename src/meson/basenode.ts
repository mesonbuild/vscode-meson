import { TreeItem } from "vscode";

export abstract class BaseNode {
  constructor(public readonly id: string) {}
  abstract getChildren(): BaseNode[];
  getTreeItem() {
    const item = new TreeItem(this.id);
    item.id = this.id;
    return item;
  }
}
