import * as vscode from "vscode";
import * as path from "path";

import { BaseNode, IBuildableNode } from "./base";
import { SubprojectsRootNode } from "./subprojects";
import { TargetDirectoryNode } from "./targets";
import { TestRootNode } from "./tests";

import { MesonProjectExplorer } from "../index";
import { ProjectInfo } from "../../meson/types";
import { getMesonBenchmarks, getMesonTargets, getMesonTests } from "../../meson/introspection";
import { execAsTask, extensionConfiguration, extensionRelative } from "../../utils";
import { makeTaskTitle, runMesonBuild } from "../../meson/runners";

export class BuildDirectoryNode extends BaseNode implements IBuildableNode {
	private watcher;

	constructor(
		ctx: vscode.ExtensionContext,
		public readonly projectInfo: ProjectInfo,
		private readonly workspaceFolder: vscode.WorkspaceFolder,
		private readonly buildDir: string,
		private readonly isExpanded: boolean
	) {
		// Unique id for the root node of this (root directory, project, build dir).
		// All other nodes hang off this id so they are unique.
		super(`project-${workspaceFolder.uri.fsPath}-${projectInfo.descriptive_name}-${buildDir}`);

		// Watch for external changes to build files.
		this.watcher = vscode.workspace.createFileSystemWatcher(`${this.buildDir}/build.ninja`, false, false, true);
		this.watcher.onDidCreate(() => MesonProjectExplorer.refresh());
		this.watcher.onDidChange(() => MesonProjectExplorer.refresh());
		ctx.subscriptions.push(this.watcher);
	}

	getTreeItem() {
		const item = super.getTreeItem() as vscode.TreeItem;

		item.label = path.basename(this.buildDir);
		item.tooltip = this.buildDir;
		item.iconPath = extensionRelative("res/meson_32.svg");
		item.collapsibleState = this.isExpanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;

		// To key in to "when": "view == meson-project && viewItem == builddir" in package.json.
		item.contextValue = "builddir";

		return item;
	}

	async reconfigure() {
        // Note "setup --reconfigure" needs to be run from the root.
		const title = makeTaskTitle("reconfigure", this.buildDir, this.getName());

        return execAsTask(extensionConfiguration("mesonPath"), ["setup", "--reconfigure", this.buildDir], { cwd: this.workspaceFolder.uri.fsPath },
			vscode.TaskRevealKind.Always, null, title);
	}

	async clean() {
		const title = makeTaskTitle("clean", this.buildDir, this.getName());

		return execAsTask(extensionConfiguration("mesonPath"), ["compile", "--clean"], { cwd: this.buildDir }, vscode.TaskRevealKind.Silent, null, title);
	}

	async build() {
		runMesonBuild(this.buildDir, this.getName(), null);
	}

	getName() {
		return this.projectInfo.descriptive_name;
	}

	async getChildren() {
		let children: BaseNode[] = [
			new TargetDirectoryNode(`${this.id}-targets`, this.workspaceFolder, this.buildDir,
				".",
				(await getMesonTargets(this.buildDir)).filter((target) => !target.subproject)
			)
		];

		const tests = await getMesonTests(this.buildDir);
		if (tests.length > 0) {
			children.push(new TestRootNode(this.id, this.buildDir, tests, false));
		}

		const benchmarks = await getMesonBenchmarks(this.buildDir);
		if (benchmarks.length > 0) {
			children.push(new TestRootNode(this.id, this.buildDir, benchmarks, true));
		}

		if (this.projectInfo.subprojects.length > 0) {
			children.push(new SubprojectsRootNode(this.id, this.workspaceFolder, this.buildDir, this.projectInfo.subprojects));
		}

		return children;
	}
}
