import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import { BaseNode } from "./base";
import { BuildDirectoryNode } from "./builddirectory";
import { ProjectNode } from "./project";

import { MesonProjectExplorer } from "../index";
import { extensionConfiguration, fileExists } from "../../utils";
import { getMesonProjectInfo } from "../../meson/introspection";

export class WorkspaceRootNode extends BaseNode {
	private isLinux = os.platform() == "linux";
	private projectNodes: ProjectNode[] = [];
	private buildDirectoryWatchers: vscode.FileSystemWatcher[] = [];

	constructor(private readonly ctx: vscode.ExtensionContext, public readonly workspaceFolder: vscode.WorkspaceFolder) {
		super(workspaceFolder.uri.fsPath);
	}

	dispose() {
		for (const watcher of this.buildDirectoryWatchers) {
			watcher.dispose();
		}
	}

	get hasMesonProject() {
		return this.projectNodes.length > 0;
	}

	async readdir() {
		const defaultBuildDir = extensionConfiguration("buildFolder");
		const defaultBuildDirParent = path.dirname(defaultBuildDir);
		const defaultBuildDirParentPath = path.join(this.workspaceFolder.uri.fsPath, defaultBuildDirParent);
		const defaultBuildPath = path.join(this.workspaceFolder.uri.fsPath, defaultBuildDir);

		this.projectNodes = [];

		const watchCallback = (type: string, pattern: vscode.RelativePattern) => {
			console.log(`${pattern.baseUri.fsPath}/${pattern.pattern}: adding ${type} watch`);

			return (uri: vscode.Uri) => {
				console.log(`${pattern.baseUri.fsPath}/${pattern.pattern}: ${type} for ${uri.fsPath}`);
				MesonProjectExplorer.refresh()
			};
		};

		// Watch for build directory adds/deletes.
		// If the config buildFolder specifies a nested dir of the workspace root (e.g. "builds/debug"):
		// If "builds" doesn't yet exist and "builds/debug" is created atomically, then the watch on "workspaceFolder/builds/*" won't pick it up.
		// Doing a recursive watch will work, but that's a lot of unnecessary events potentially. So if "builds" doesn't exist, watch for it,
		// and if it does exist, watch for changes in it. When "builds" is created as part of making "builds/debug" we'll be refreshed and do the
		// updated watch.
		let buildDirectoryWatcher: vscode.FileSystemWatcher;
		let pattern: vscode.RelativePattern;
		if (await fileExists(defaultBuildDirParentPath)) {
			// Watching "builds/*" will not fire the delete handler if "builds" is deleted.
			// Just watch the parent build dir for deletion.
			pattern = new vscode.RelativePattern(this.workspaceFolder, path.join(defaultBuildDirParent));
			const buildDirectoryWatcher = vscode.workspace.createFileSystemWatcher(pattern, true, true);
			buildDirectoryWatcher.onDidDelete(watchCallback("delete", pattern));
			this.buildDirectoryWatchers.push(buildDirectoryWatcher);

			// And watch "builds/*" for new dirs.
			pattern = new vscode.RelativePattern(this.workspaceFolder, path.join(defaultBuildDirParent, "*"));
		}
		else {
			pattern = new vscode.RelativePattern(this.workspaceFolder, "*");
		}

		buildDirectoryWatcher = vscode.workspace.createFileSystemWatcher(pattern, false, true);
		buildDirectoryWatcher.onDidCreate(watchCallback("create", pattern));
		buildDirectoryWatcher.onDidDelete(watchCallback("delete", pattern));
		this.buildDirectoryWatchers.push(buildDirectoryWatcher);

		// Walk existing build dirs.

		// This looks a bit weird, but is to cope with potentially stale build directories that have a differing ProjectInfo.descriptive_name.
		// Each unique descriptive_name is a node with build directories of that name below it.
		// "meson introspect --ast meson.build" not great for getting at the project name.
		const buildDirectoryMap = new Map<string, BuildDirectoryNode[]>();
		let pendingBuildPaths: string[] = [];

		try {
			const entries = await fs.promises.readdir(defaultBuildDirParentPath, { withFileTypes: true });

			for (const entry of entries.filter((entry) => entry.isDirectory())) {
				const buildPath = path.join(defaultBuildDirParentPath, entry.name);
				const buildDir = path.relative(this.workspaceFolder.uri.fsPath, buildPath);

				try {
					const projectInfo = await getMesonProjectInfo(buildPath);

					// A valid meson builddir exists if we get this far.
					let buildDirectoryNodes = buildDirectoryMap.get(projectInfo.descriptive_name);
					if (buildDirectoryNodes == null) {
						buildDirectoryNodes = new Array<BuildDirectoryNode>();
						buildDirectoryMap.set(projectInfo.descriptive_name, buildDirectoryNodes);
					}

					// Expand this node if it's the default builddir.
					buildDirectoryNodes.push(new BuildDirectoryNode(this.ctx, projectInfo, this.workspaceFolder, buildPath, (buildPath === defaultBuildPath)));
				}
				catch (e) {
					pendingBuildPaths.push(buildPath);

					// See comment below r.e. Linux.
					if (!this.isLinux) {
						// We'll get here if a build directory was just created but getMesonProjectInfo() fails and setup is still in progress.
						// Empirically it looks like intro-projectinfo.json is created atomically.
						// TODO should check meson code to confirm. Add watch on changes if not.

						const pattern = new vscode.RelativePattern(this.workspaceFolder, path.join(buildDir, "meson-info/intro-projectinfo.json"));
						const buildDirectoryWatcher = vscode.workspace.createFileSystemWatcher(pattern, false, true, true);
						buildDirectoryWatcher.onDidCreate(watchCallback("create", pattern));
						this.buildDirectoryWatchers.push(buildDirectoryWatcher);
					}
				}
			}
		}
		catch (e) {
		}

		// Create ProjectNode for valid build dirs.
		for (const [projectName, buildDirectoryNodes] of buildDirectoryMap) {
			this.projectNodes.push(new ProjectNode(this.workspaceFolder, buildDirectoryNodes[0].projectInfo, buildDirectoryNodes));
		}

		if (this.isLinux) {
			// Linux watches are broken: https://github.com/microsoft/vscode/issues/164672 ?
			// The top-level one is OK, but then the above watches for meson-info just don't fire at all on Fedora 37 no matter what
			// I've tried (watch for "meson-info" when it doesn't exist, "meson-info/*" when it does ... Nothing.
			// So just run an async poll waiting 10s for getMesonProjectInfo() to succeed then refresh.
			const timeout = 500;

			for (const buildPath of pendingBuildPaths) {
				(async () => {
					for (let i = 0; i < (10000 / timeout); ++i) {
						try {
							await getMesonProjectInfo(buildPath);
							MesonProjectExplorer.refresh();
							break;
						}
						catch (e) {
						}

						await new Promise((resolve) => setTimeout(resolve, timeout));
					}
				})();
			}
		}

		// TODO put back as appropriate:
		// await rebuildTests(controller);
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
