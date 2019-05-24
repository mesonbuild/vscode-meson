import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { ProjectInfo, Subproject, Tests, Targets } from "../../meson/types";
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
      new SubprojectsRootNode(this.project.subprojects, this.buildDir),
      new TargetDirectoryNode(
        ".",
        (await getMesonTargets(this.buildDir)).filter(t => !t.subproject)
      ),
      new TestRootNode(await getMesonTests(this.buildDir))
    ];
  }
}

export class SubprojectsRootNode extends BaseNode {
  constructor(
    private readonly subprojects: Subproject[],
    private readonly buildDir: string
  ) {
    super(
      hash(subprojects.map(s => `${s.descriptive_name} ${s.version}`).join(";"))
    );
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.label = "Subprojects";
    item.iconPath = extensionRelative("res/icon-subprojects.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  getChildren() {
    return this.subprojects.map(s => new SubprojectNode(s, this.buildDir));
  }
}

export class TargetsRootNode extends BaseNode {
  constructor(private readonly targets: Targets) {
    super(hash(targets.map(t => `${t.subproject}/${t.name}`).join(";")));
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.label = "Targets";
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    return item;
  }

  getChildren() {
    return this.targets.map(t => new TargetNode(t));
  }
}

export class TestRootNode extends BaseNode {
  constructor(private readonly tests: Tests) {
    super(hash(tests.map(t => t.suite + t.name).join(";")));
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    item.label = "Tests";
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    return item;
  }

  getChildren() {
    return this.tests.map(t => new TestNode(t));
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
    item.iconPath = extensionRelative("res/icon-subproject.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    return item;
  }

  async getChildren() {
    return await getMesonTargets(this.buildDir)
      .then(tts => tts.filter(t => t.subproject === this.subproject.name))
      .then(tt => tt.map(t => new TargetNode(t)));
  }
}
