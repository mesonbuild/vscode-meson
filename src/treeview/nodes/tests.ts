import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { Test } from "../../meson/types";
import { extensionRelative } from "../../utils";

export class TestNode extends BaseNode {
  constructor(private readonly test: Test) {
    super(test.name);
  }

  getChildren() {
    return [];
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.label = this.test.name;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.command = {
      title: "Run test",
      command: "mesonbuild.test",
      arguments: [this.test.name]
    };

    return item;
  }
}
