import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { Test, Tests } from "../../meson/types";
import { extensionRelative } from "../../utils";

export class TestRootNode extends BaseNode {
  constructor(parentId, private readonly tests: Tests, private readonly isBenchmark) {
    super(`${parentId}-${isBenchmark ? "benchmarks" : "tests"}`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.isBenchmark ? "Benchmarks" : "Tests";
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = (this.tests.length === 0) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  getChildren() {
    return this.tests.map((test) => new TestNode(this.id, test, this.isBenchmark));
  }
}

class TestNode extends BaseNode {
  constructor(parentId: string, private readonly test: Test, private readonly isBenchmark) {
    super(`${parentId}-${test.name}`);
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

    // No children currently, so don't display toggle.
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;

    return item;
  }
}
