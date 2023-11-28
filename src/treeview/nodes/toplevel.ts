import * as vscode from "vscode";

import { BaseNode } from "../basenode";
import { ProjectInfo, Subproject, Targets, Tests, pseudoAllTarget } from "../../types";
import { extensionRelative } from "../../utils";
import { TargetDirectoryNode } from "./targets";
import { getMesonBenchmarks, getMesonTargets, getMesonTests } from "../../introspection";
import { TestRootNode } from "./tests";
import { IBuildableNode } from "./base";

export class ProjectNode extends BaseNode implements IBuildableNode {
  constructor(
    private readonly project: ProjectInfo,
    projectDir: string,
    private readonly buildDir: string,
  ) {
    // Unique id for the root node of this (root directory, project, build dir).
    // All other nodes hang off this id so they are unique.
    super(`project-${projectDir}-${project.descriptive_name}-${buildDir}`);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = `${this.project.descriptive_name}`;
    if (this.project.version !== "undefined") item.label += ` (${this.project.version})`;
    item.iconPath = extensionRelative("res/meson_32.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;

    // To key in to "when": "view == meson-project && viewItem == test" in package.json.
    item.contextValue = "meson-projectroot";

    return item;
  }

  override async getChildren() {
    const targets = await getMesonTargets(this.buildDir);

    let children: BaseNode[] = [
      new TargetDirectoryNode(
        `${this.id}-targets`,
        ".",
        targets.filter((target) => !target.subproject),
      ),
    ];

    const all_tests = await getMesonTests(this.buildDir);
    const tests = all_tests.filter((t) => t.suite[0].split(":")[0] === this.project.descriptive_name);
    if (tests.length > 0) {
      children.push(new TestRootNode(this.id, tests, false));
    }

    const all_benchmarks = await getMesonBenchmarks(this.buildDir);
    const benchmarks = all_benchmarks.filter((t) => t.suite[0].split(":")[0] === this.project.descriptive_name);
    if (benchmarks.length > 0) {
      children.push(new TestRootNode(this.id, benchmarks, true));
    }

    if (this.project.subprojects.length > 0) {
      children.push(
        new SubprojectsRootNode(this.id, this.project.subprojects, this.buildDir, targets, all_tests, all_benchmarks),
      );
    }

    return children;
  }

  build() {
    return vscode.commands.executeCommand("mesonbuild.build", pseudoAllTarget);
  }
}

class SubprojectsRootNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly subprojects: Subproject[],
    private readonly buildDir: string,
    private readonly targets: Targets,
    private readonly tests: Tests,
    private readonly benchmarks: Tests,
  ) {
    super(`${parentId}-subprojects`);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = "Subprojects";
    item.iconPath = extensionRelative("res/icon-subprojects.svg");
    item.collapsibleState =
      this.subprojects.length === 0 ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  override getChildren() {
    return this.subprojects.map(
      (subproject) => new SubprojectNode(this.id, subproject, this.buildDir, this.targets, this.tests, this.benchmarks),
    );
  }
}

class SubprojectNode extends BaseNode {
  readonly targets: Targets;
  readonly tests: Tests;
  readonly benchmarks: Tests;

  constructor(
    parentId: string,
    private readonly subproject: Subproject,
    private readonly buildDir: string,
    targets: Targets,
    tests: Tests,
    benchmarks: Tests,
  ) {
    super(
      `${parentId}-${subproject.descriptive_name}${subproject.version !== "undefined" ? `-${subproject.version}` : ""}`,
    );
    this.targets = targets.filter((t) => t.subproject === this.subproject.name);
    this.tests = tests.filter((t) => t.suite[0].split(":")[0] === this.subproject.name);
    this.benchmarks = benchmarks.filter((t) => t.suite[0].split(":")[0] === this.subproject.name);
  }

  override getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;
    const has_children = this.targets.length > 0 || this.tests.length > 0 || this.benchmarks.length > 0;

    item.label = `${this.subproject.descriptive_name}`;
    if (this.subproject.version !== "undefined") item.label += ` (${this.subproject.version})`;
    item.iconPath = extensionRelative("res/icon-subproject.svg");
    item.collapsibleState = has_children
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    return item;
  }

  override async getChildren() {
    let children: BaseNode[] = [];
    if (this.targets.length > 0) {
      children.push(new TargetDirectoryNode(`${this.id}-targets`, ".", this.targets));
    }
    if (this.tests.length > 0) {
      children.push(new TestRootNode(this.id, this.tests, false));
    }
    if (this.benchmarks.length > 0) {
      children.push(new TestRootNode(this.id, this.benchmarks, true));
    }
    return children;
  }
}
