import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { Test, Tests, pseudoAllTarget } from "../../types";
import { extensionRelative } from "../../utils";
import { IRunnableNode } from "./base";

function getTestCommand(isBenchmark: boolean): string {
  return isBenchmark ? "benchmark" : "test";
}

export class TestRootNode extends BaseNode implements IRunnableNode {
  constructor(
    parentId: string,
    private readonly tests: Tests,
    private readonly isBenchmark: boolean,
  ) {
    super(`${parentId}-${getTestCommand(isBenchmark)}`);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.isBenchmark ? "Benchmarks" : "Tests";
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState =
      this.tests.length === 0 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

    // To key in to "when": "view == meson-project && viewItem == meson-test-root" in package.json.
    item.contextValue = "meson-test-root";

    return item;
  }

  override getChildren() {
    return this.tests.map((test) => new TestNode(this.id, test, this.isBenchmark));
  }

  run() {
    return vscode.commands.executeCommand(`mesonbuild.${getTestCommand(this.isBenchmark)}`, pseudoAllTarget);
  }
}

class TestNode extends BaseNode implements IRunnableNode {
  private readonly taskName: string;
  private readonly command: string;

  constructor(
    parentId: string,
    private readonly test: Test,
    private readonly isBenchmark: boolean,
  ) {
    super(`${parentId}-${test.suite[0]}-${test.name}`);

    this.command = getTestCommand(this.isBenchmark);
    const project = this.test.suite[0].split(":")[0];
    this.taskName = `${project}:${this.test.name}`;
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = this.test.name;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.command = {
      title: `Run ${this.command}`,
      command: `mesonbuild.${this.command}`,
      arguments: [this.taskName],
    };

    // No children currently, so don't display toggle.
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;

    // To key in to "when": "view == meson-project && viewItem == meson-test" in package.json.
    item.contextValue = "meson-test";

    return item;
  }

  run() {
    return vscode.commands.executeCommand(`mesonbuild.${this.command}`, this.taskName);
  }
}
