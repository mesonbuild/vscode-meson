import * as vscode from "vscode";

import { BaseNode, IRunnableNode } from "./base";
import { Test, Tests } from "../../meson/types";
import { extensionRelative } from "../../utils";

export class TestRootNode extends BaseNode implements IRunnableNode {
  constructor(parentId, private readonly buildDir, private readonly tests: Tests, private readonly isBenchmark) {
    super(`${parentId}-${isBenchmark ? "benchmarks" : "tests"}`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.isBenchmark ? "Benchmarks" : "Tests";
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = (this.tests.length === 0) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

    // To key in to "when": "view == meson-project && viewItem == test" in package.json.
    item.contextValue = "test";

    return item;
  }

  getChildren() {
    return this.tests.map((test) => new TestNode(this.id, this.buildDir, test, this.isBenchmark));
  }

  run() {
    return vscode.commands.executeCommand(`mesonbuild.${this.isBenchmark ? "benchmark" : "test"}`, this.buildDir);
  }
}

class TestNode extends BaseNode implements IRunnableNode {
  constructor(parentId: string, private readonly buildDir: string, private readonly test: Test, private readonly isBenchmark) {
    super(`${parentId}-${test.name}`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.test.name;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.command = {
      title: `Run ${this.isBenchmark ? "benchmark" : "test"}`,
      command: `mesonbuild.${this.isBenchmark ? "benchmark" : "test"}`,
      arguments: [this.buildDir, this.test.name]
    };

    // No children currently, so don't display toggle.
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;

    // To key in to "when": "view == meson-project && viewItem == test" in package.json.
    item.contextValue = "test";

    return item;
  }

  run() {
    return vscode.commands.executeCommand(`mesonbuild.${this.isBenchmark ? "benchmark" : "test"}`, this.buildDir, this.test.name);
  }
}
