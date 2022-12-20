import * as vscode from "vscode";
import * as path from "path";

import { BaseNode } from "./base";
import { Subproject } from "../../meson/types";
import { extensionRelative } from "../../utils";
import { TargetNode } from "./targets";
import { TargetSourceFileNode } from "./sources";
import { getMesonTargets } from "../../meson/introspection";

export class SubprojectsRootNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly buildDir: string,
    private readonly subprojects: Subproject[]
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
    return this.subprojects.map((subproject) => new SubprojectNode(this.id, this.workspaceFolder, this.buildDir, subproject));
  }
}

class SubprojectNode extends BaseNode {
  constructor(
    parentId: string,
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly buildDir: string,
    private readonly subproject: Subproject
  ) {
    super(`${parentId}-${subproject.descriptive_name}-${subproject.version}`);
  }

  getTreeItem() {
    const item = super.getTreeItem() as vscode.TreeItem;

    item.label = `${this.subproject.descriptive_name} ${this.subproject.version}`;
    item.iconPath = extensionRelative("res/icon-subproject.svg");
    item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

    return item;
  }

  async getChildren() {
    const targets = await getMesonTargets(this.buildDir);
    const targetNodes = targets.filter((target) => target.subproject === this.subproject.name).map(target => new TargetNode(this.id, this.workspaceFolder, this.buildDir, target));
    const mesonBuild = new TargetSourceFileNode(this.id, path.join(this.workspaceFolder.uri.fsPath, "subprojects", `${this.subproject.name}-${this.subproject.version}`, "meson.build"));

    return [...targetNodes, mesonBuild];
  }
}
