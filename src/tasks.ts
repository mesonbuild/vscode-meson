'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import { exists, exec } from './utils';

interface MesonTaskDefinition extends vscode.TaskDefinition {
	task: string;
	file?: string;
}

export async function getMesonTasks(dir: string): Promise<vscode.Task[]> {
	let emptyTasks: vscode.Task[] = [];
	if (!dir) {
		return emptyTasks;
	}
	let mesonFile = path.join(dir, 'meson.build');
	if (!await exists(mesonFile)) {
		return emptyTasks;
	}

	let commandLine = 'meson . .meson';
	try {
		let { stdout, stderr } = await exec(commandLine, { cwd: dir });
		if (stderr && stderr.length > 0) {
			getOutputChannel().appendLine(stderr);
			getOutputChannel().show(true);
		}
		let result: vscode.Task[] = [];
		if (stdout) {
			let taskName = "build";
			let kind: MesonTaskDefinition = {
				type: 'meson',
				task: taskName
			};
			let task = new vscode.Task(kind, taskName, 'meson', new vscode.ShellExecution("ninja", {cwd: dir+"/.meson"}));
			task.group = vscode.TaskGroup.Build;
			result.push(task);
		}
		return result;
	} catch (err) {
		let channel = getOutputChannel();
		if (err.stderr) {
			channel.appendLine(err.stderr);
		}
		if (err.stdout) {
			channel.appendLine(err.stdout);
		}
		channel.appendLine('Auto detecting meson task failed.');
		channel.show(true);
		return emptyTasks;
	}
}

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('Meson Auto Detection');
	}
	return _channel;
}

/*
const buildNames: string[] = ['build', 'compile', 'watch'];
function isBuildTask(name: string): boolean {
	for (let buildName of buildNames) {
		if (name.indexOf(buildName) !== -1) {
			return true;
		}
	}
	return false;
}

const testNames: string[] = ['test'];
function isTestTask(name: string): boolean {
	for (let testName of testNames) {
		if (name.indexOf(testName) !== -1) {
			return true;
		}
	}
	return false;
}
*/