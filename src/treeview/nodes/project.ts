
import * as vscode from "vscode";

import { BaseNode } from "./base";
import { BuildDirectoryNode } from "./builddirectory";

import { ProjectInfo } from "../../meson/types"

export class ProjectNode extends BaseNode {
	constructor(private readonly workspaceFolder: vscode.WorkspaceFolder, private readonly projectInfo: ProjectInfo, private readonly buildDirectoryNodes: BuildDirectoryNode[]) {
		super(`project-${workspaceFolder.uri.fsPath}-${projectInfo.descriptive_name}`);
	}

	getChildren() {
		return this.buildDirectoryNodes;
	}

	getTreeItem() {
		const item = super.getTreeItem() as vscode.TreeItem;

		item.label = this.projectInfo.descriptive_name;
		item.tooltip = this.workspaceFolder.uri.fsPath;
		item.iconPath = vscode.ThemeIcon.Folder;
		item.collapsibleState = (this.buildDirectoryNodes.length === 0) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Expanded;

		// To key in to "when": "view == meson-project && viewItem == meson-projectroot" in package.json.
		item.contextValue = "meson-projectroot";

		return item;
	}
}
