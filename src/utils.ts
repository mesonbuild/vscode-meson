"use strict";

import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import { randomBytes, createHash, BinaryLike } from "crypto";
import { Target } from "./meson/types";

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

export function parseJSONFileIfExists<T = object>(path: string) {
  return new Promise<T | false>((resolve, reject) => {
    fs.exists(path, exists => {
      if (!exists) reject(false);
      fs.readFile(path, (err, data) => {
        if (err) resolve(false);
        resolve(JSON.parse(data.toString()) as T);
      });
    });
  });
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

export function getTargetName(t: Target) {
  return path.join(
    path.relative(vscode.workspace.rootPath, path.dirname(t.defined_in)),
    t.name
  );
}

export function randomString(length = 4) {
  return randomBytes(length)
    .toString("base64")
    .substr(0, length);
}

export function hash(input: BinaryLike) {
  const hashObj = createHash("sha1");
  hashObj.update(input);
  return hashObj.digest("hex");
}
