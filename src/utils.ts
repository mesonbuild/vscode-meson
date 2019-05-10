"use strict";

import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import { randomBytes } from "crypto";
import { TextEncoder } from "util";

export function exists(file: string): Promise<boolean> {
  return new Promise<boolean>((resolve, _reject) => {
    fs.exists(file, value => {
      resolve(value);
    });
  });
}

export function exec(
  command: string,
  options: cp.ExecOptions
): Promise<{ stdout: string; stderr: string }> {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    cp.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      }
      resolve({ stdout, stderr });
    });
  });
}

export function execAsTask(
  command: string,
  options: vscode.ShellExecutionOptions,
  reveal = false
) {
  const task = new vscode.Task(
    { type: "temp" },
    command,
    "Meson",
    new vscode.ShellExecution(command, options)
  );
  task.presentationOptions.echo = false;
  task.presentationOptions.focus = false;
  task.presentationOptions.reveal = reveal
    ? vscode.TaskRevealKind.Always
    : vscode.TaskRevealKind.Silent;
  return vscode.tasks.executeTask(task);
}

let _channel: vscode.OutputChannel;
export function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel("Meson Build");
  }
  return _channel;
}

export function thisExtension() {
  const ext = vscode.extensions.getExtension("asabil.meson");
  if (ext) return ext;
  else throw new Error("Extension not found");
}

export function extensionRelative(filepath: string) {
  return path.join(thisExtension().extensionPath, filepath);
}

export function randomString(length = 4) {
  return randomBytes(length)
    .toString("base64")
    .substr(0, length);
}
