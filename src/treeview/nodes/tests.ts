import * as vscode from "vscode";

import { BaseNode } from "../basenode.js";
import { Test, Tests } from "../../types.js";
import { extensionRelative } from "../../utils.js";

export class TestRootNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly tests: Tests,
    private readonly isBenchmark: boolean,
  ) {
    super(`${parentId}-${isBenchmark ? "benchmarks" : "tests"}`);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.isBenchmark ? "Benchmarks" : "Tests";
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState =
      this.tests.length === 0 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  override getChildren() {
    return this.tests.map((test) => new TestNode(this.id, test, this.isBenchmark));
  }
}

class TestNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly test: Test,
    private readonly isBenchmark: boolean,
  ) {
    super(`${parentId}-${test.suite[0]}-${test.name}`);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    const project = this.test.suite[0].split(":")[0];
    const name = `${project}:${this.test.name}`;

    item.label = this.test.name;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.command = {
      title: `Run ${this.isBenchmark ? "benchmark" : "test"}`,
      command: `mesonbuild.${this.isBenchmark ? "benchmark" : "test"}`,
      arguments: [name],
    };

    // No children currently, so don't display toggle.
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;

    return item;
  }
}
