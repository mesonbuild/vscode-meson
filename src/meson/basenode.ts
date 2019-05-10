import { TreeItem } from "vscode";

export class BaseNode {
  constructor(public readonly id: string) {}
  getChildren(): BaseNode[] {
    return [];
  }

  getTreeItem() {
    const item = new TreeItem(this.id);
    item.id = this.id;
    return item;
  }
}
