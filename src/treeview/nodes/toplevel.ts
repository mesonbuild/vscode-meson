import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { ProjectInfo, Subproject } from "../../meson/types";
import { extensionRelative } from "../../utils";
import { TargetDirectoryNode, TargetNode } from "./targets";
import { getMesonBenchmarks, getMesonTargets, getMesonTests } from "../../meson/introspection";
import { TestRootNode } from "./tests";

export class ProjectNode extends BaseNode {
  constructor(
    private readonly project: ProjectInfo,
    projectDir: string,
    private readonly buildDir: string
  ) {
    // Unique id for the root node of this (root directory, project, build dir).
    // All other nodes hang off this id so they are unique.
    super(`project-${projectDir}-${project.descriptive_name}-${buildDir}`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = `${this.project.descriptive_name} ${this.project.version}`;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

    return item;
  }

  async getChildren() {
    let children: BaseNode[] = [
      new TargetDirectoryNode(`${this.id}-targets`,
        ".",
        (await getMesonTargets(this.buildDir)).filter((target) => !target.subproject)
      )
    ];

    const tests = await getMesonTests(this.buildDir);
    if (tests.length > 0) {
      children.push(new TestRootNode(this.id, tests, false));
    }

    const benchmarks = await getMesonBenchmarks(this.buildDir);
    if (benchmarks.length > 0) {
      children.push(new TestRootNode(this.id, benchmarks, true));
    }

    if (this.project.subprojects.length > 0) {
      children.push(new SubprojectsRootNode(this.id, this.project.subprojects, this.buildDir));
    }

    return children;
  }
}

class SubprojectsRootNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly subprojects: Subproject[],
    private readonly buildDir: string
  ) {
    super(`${parentId}-subprojects`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = "Subprojects";
    item.iconPath = extensionRelative("res/icon-subprojects.svg");
    item.collapsibleState = (this.subprojects.length === 0) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  getChildren() {
    return this.subprojects.map((subproject) => new SubprojectNode(this.id, subproject, this.buildDir));
  }
}

class SubprojectNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly subproject: Subproject,
    private readonly buildDir: string
  ) {
    super(`${parentId}-${subproject.descriptive_name}-${subproject.version}`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = `${this.subproject.descriptive_name} ${this.subproject.version}`;
    item.iconPath = extensionRelative("res/icon-subproject.svg");

    // No children currently, so don't display toggle.
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;

    return item;
  }

  async getChildren() {
    const targets = await getMesonTargets(this.buildDir);

    return targets.filter(t => t.subproject === this.subproject.name).map(t => new TargetNode(this.id, t));
  }
}
