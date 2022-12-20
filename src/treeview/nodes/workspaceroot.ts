import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

import { BaseNode } from "./base";
import { BuildDirectoryNode } from "./builddirectory";
import { ProjectNode } from "./project";

import { MesonProjectExplorer } from "../index";
import { extensionConfiguration, fileExists } from "../../utils";
import { getMesonProjectInfo } from "../../meson/introspection";

export class WorkspaceRootNode extends BaseNode {
	private projectNodes: ProjectNode[] = [];
	private buildDirectoryWatcher: vscode.FileSystemWatcher;
	private readonly mesonBuildPath: string;

	constructor(private readonly ctx: vscode.ExtensionContext, public readonly workspaceFolder: vscode.WorkspaceFolder) {
		super(workspaceFolder.uri.fsPath);

		this.mesonBuildPath = path.join(this.workspaceFolder.uri.fsPath, "meson.build");
	}

	dispose() {
		this.buildDirectoryWatcher?.dispose();
	}

	get hasMesonProject() {
		return this.projectNodes.length > 0;
	}

	async readdir() {
		const defaultBuildDir = extensionConfiguration("buildFolder");
		const defaultBuildDirParent = path.dirname(defaultBuildDir);
		const buildDirParentPath = path.join(this.workspaceFolder.uri.fsPath, defaultBuildDirParent);
		const defaultBuildPath = path.join(this.workspaceFolder.uri.fsPath, defaultBuildDir);

		this.projectNodes = [];

		try {
			const entries = await fs.promises.readdir(buildDirParentPath, { withFileTypes: true });

			// This looks a bit weird, but is to cope with potentially stale build directories that have a differing ProjectInfo.descriptive_name.
			// Each unique descriptive_name is a node with build directories of that name below it.
			// "meson introspect --ast meson.build" not great for getting at the project name.
			const buildDirectoryMap = new Map<string, BuildDirectoryNode[]>();

			for (const entry of entries.filter((entry) => entry.isDirectory())) {
				try {
					const buildDir = path.join(buildDirParentPath, entry.name);
					const projectInfo = await getMesonProjectInfo(buildDir);

					// A meson builddir exists if we get this far.
					let buildDirectoryNodes = buildDirectoryMap.get(projectInfo.descriptive_name);
					if (buildDirectoryNodes == null) {
						buildDirectoryNodes = new Array<BuildDirectoryNode>();
						buildDirectoryMap.set(projectInfo.descriptive_name, buildDirectoryNodes);
					}

					// Expand this node if it's the default builddir.
					buildDirectoryNodes.push(new BuildDirectoryNode(this.ctx, projectInfo, this.workspaceFolder, buildDir, (buildDir === defaultBuildPath)));
				}
				catch (e) {
				}
			}

			for (const [projectName, buildDirectoryNodes] of buildDirectoryMap) {
				this.projectNodes.push(new ProjectNode(this.workspaceFolder, buildDirectoryNodes[0].projectInfo, buildDirectoryNodes));
			}
		}
		catch (e) {
		}

		// Watch for build directory adds/deletes.
		// If the config buildFolder specifies a nested dir of the workspace root (e.g. "builds/debug") but if "builds" doesn't yet exist
		// and "builds/debug" is created atomically, then the watch on "workspaceFolder/builds/*" won't pick it up.
		// Doing a recursive watch will work, but that's a lot of unnecessary events potentially. So if "builds" doesn't exist, watch for it,
		// and if it does exist, watch for changes in it. When "builds" is created as part of making "builds/debug" we'll be refreshed and do the
		// updated watch.
		if (await fileExists(buildDirParentPath)) {
			this.buildDirectoryWatcher =
				vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceFolder, path.join(defaultBuildDirParent, "*")));
		}
		else {
			this.buildDirectoryWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceFolder, "*"));
		}
		this.buildDirectoryWatcher.onDidCreate(() => MesonProjectExplorer.refresh());
		this.buildDirectoryWatcher.onDidChange(() => MesonProjectExplorer.refresh());
		this.buildDirectoryWatcher.onDidDelete(() => MesonProjectExplorer.refresh());
	}

	getChildren() {
		return this.projectNodes;
	}

	getTreeItem() {
		const item = super.getTreeItem() as vscode.TreeItem;

		item.label = path.basename(this.workspaceFolder.uri.fsPath);
		item.tooltip = this.workspaceFolder.uri.fsPath;
		item.iconPath = vscode.ThemeIcon.Folder;
		item.collapsibleState = (this.projectNodes.length === 0) ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed;

		// To key in to "when": "view == meson-project && viewItem == meson-workspaceroot" in package.json.
		item.contextValue = "meson-workspaceroot";

		return item;
	}
}
