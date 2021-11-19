import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { Test } from "../../meson/types";
import { extensionRelative } from "../../utils";

export class TestNode extends BaseNode {
  constructor(private readonly test: Test, private readonly isBenchmark) {
    super(`${isBenchmark ? "benchmark-" : "test-"}${test.name}`);
  }

  getChildren() {
    return [];
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.label = this.test.name;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.command = {
      title: `Run ${this.isBenchmark ? "benchmark" : "test"}`,
      command: `mesonbuild.${this.isBenchmark ? "benchmark" : "test"}`,
      arguments: [this.test.name]
    };

    return item;
  }
}
