import * as vscode from "vscode";

import { BaseNode } from "./base";
import { ProjectInfo, Subproject, Tests } from "../../meson/types";
import { extensionRelative, hash } from "../../utils";
import { TargetDirectoryNode, TargetNode } from "./targets";
import { getMesonTargets, getMesonTests } from "../../meson/introspection";
import { TestNode } from "./tests";

export class ProjectNode extends BaseNode {
  constructor(
    private readonly project: ProjectInfo,
    private readonly buildDir: string
  ) {
    super(project.descriptive_name + " " + project.version);
  }
  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    return item;
  }
  async getChildren() {
    return [
      ...this.project.subprojetcs.map(
        s => new SubprojectNode(s, this.buildDir)
      ),
      new TargetDirectoryNode(
        ".",
        (await getMesonTargets(this.buildDir)).filter(t => !t.subproject)
      ),
      new TestRootNode(await getMesonTests(this.buildDir))
    ];
  }
}

export class SubprojectNode extends BaseNode {
  constructor(
    private readonly subproject: Subproject,
    private readonly buildDir: string
  ) {
    super(subproject.descriptive_name + " " + subproject.version);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    return item;
  }

  async getChildren() {
    return await getMesonTargets(this.buildDir)
      .then(tts => tts.filter(t => t.subproject === this.subproject.name))
      .then(tt => tt.map(t => new TargetNode(t)));
  }
}

export class TestRootNode extends BaseNode {
  constructor(private readonly tests: Tests) {
    super(hash(tests.map(t => t.suite + t.name).join(";")));
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.label = "Tests";
    item.iconPath = extensionRelative("res/meson_64.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    return item;
  }

  getChildren() {
    return this.tests.map(t => new TestNode(t));
  }
}
