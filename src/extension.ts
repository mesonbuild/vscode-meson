'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import { getMesonTasks } from './tasks';

let mesonTaskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
	let workspaceRoot = vscode.workspace.rootPath;
	if (!workspaceRoot) return;
	
	let pattern = path.join(workspaceRoot, 'meson.build');
	let mesonPromise: Thenable<vscode.Task[]> | undefined = undefined;
	let fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
	fileWatcher.onDidChange(() => mesonPromise = undefined);
	fileWatcher.onDidCreate(() => mesonPromise = undefined);
	fileWatcher.onDidDelete(() => mesonPromise = undefined);
	mesonTaskProvider = vscode.tasks.registerTaskProvider('meson', {
		provideTasks: () => {
			if (!mesonPromise)
				mesonPromise = getMesonTasks(workspaceRoot);
			return mesonPromise;
		},
		resolveTask(_task: vscode.Task): vscode.Task | undefined {
			return undefined;
		}
	});
}

export function deactivate(): void {
	if (mesonTaskProvider) {
		mesonTaskProvider.dispose();
	}
}