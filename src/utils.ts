import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import { createHash, BinaryLike } from "crypto";
import { Target } from "./meson/types";
import { ExtensionConfiguration } from "./types";
import { getMesonBuildOptions } from "./meson/introspection";
import { extensionPath } from "./extension";

export async function exec(
  command: string,
  args: string[],
  options: cp.ExecOptions = {}
): Promise<{ stdout: string; stderr: string, error?: cp.ExecException }> {
  return new Promise<{ stdout: string; stderr: string, error?: cp.ExecException }>((resolve, reject) => {
    cp.execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stdout, stderr });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export function execStream(
  command: string,
  args: string[],
  options: cp.SpawnOptions
) {
  const spawned = cp.spawn(command, args, options);
  return {
    onLine(fn: (line: string, isError: boolean) => void) {
      spawned.stdout.on("data", (msg: Buffer) => fn(msg.toString(), false));
      spawned.stderr.on("data", (msg: Buffer) => fn(msg.toString(), true));
    },
    kill(signal?: NodeJS.Signals) {
      spawned.kill(signal || "SIGKILL");
    },
    finishP() {
      return new Promise<number>(res => {
        spawned.on("exit", code => res(code));
      });
    }
  };
}

export async function execFeed(
  command: string,
  args: string[],
  options: cp.ExecOptions = {},
  stdin: string
): Promise<{ stdout: string; stderr: string, error?: cp.ExecFileException }> {
  return new Promise<{ stdout: string; stderr: string, error?: cp.ExecFileException }>(resolve => {
    let p = cp.execFile(command, args, options, (error, stdout, stderr) => {
      resolve({ stdout, stderr, error: error ? error : undefined });
    });

    p.stdin?.write(stdin);
    p.stdin?.end();
  });
}

export function execAsTask(
  command: string,
  args: string[],
  options: vscode.ProcessExecutionOptions,
  revealMode,
  problemMatcher?: string,
  taskName?: string
) {
  const task = new vscode.Task(
    // Unique type seems to allow multiple tasks to run, so use taskName if defined.
    { type: taskName ?? "temp" },
    // TODO workspaceFolder here.
    taskName ?? command,
    "Meson",
    new vscode.ProcessExecution(command, args, options),
    problemMatcher
  );
  task.presentationOptions.echo = false;
  task.presentationOptions.focus = false;
  task.presentationOptions.reveal = revealMode;
  return vscode.tasks.executeTask(task);
}

export async function parseJSONFileIfExists<T = object>(path: string) {
  try {
    const data = await fs.promises.readFile(path);
    return JSON.parse(data.toString()) as T;
  }
  catch (err) {
    return false;
  }
}

let _channel: vscode.OutputChannel;
export function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel("Meson Build");
  }
  return _channel;
}

export function extensionRelative(filepath: string) {
  return path.join(extensionPath, filepath);
}

// TODO remove all uses.
/** @deprecated */
export function workspaceRelative(filepath: string) {
  return path.resolve(vscode.workspace.rootPath, filepath);
}

export function workspaceRelative2(workspaceFolder: vscode.WorkspaceFolder, filepath: string) {
  return path.resolve(workspaceFolder.uri.fsPath, filepath);
}

// TODO remove all uses.
/** @deprecated */
export async function getTargetName(buildDir: string, target: Target) {
  return getTargetName2(vscode.workspace.workspaceFolders[0], buildDir, target);
}

export async function getTargetName2(workspaceFolder: vscode.WorkspaceFolder, buildDir: string, target: Target) {
  const buildOptions = await getMesonBuildOptions(buildDir);
  const layoutOption = buildOptions.filter((option) => option.name === "layout")[0];

  if (layoutOption.value === "mirror") {
    const relativePath = path.relative(workspaceFolder.uri.fsPath, path.dirname(target.defined_in));

    // Meson requires the separator between path and target name to be '/'.
    return path.posix.join(relativePath, target.name);
  }
  else {
    return `meson-out/${target.name}`;
  }
}

export function hash(input: BinaryLike) {
  const hashObj = createHash("sha1");
  hashObj.update(input);
  return hashObj.digest("hex");
}

export function getConfiguration() {
  return vscode.workspace.getConfiguration("mesonbuild");
}

export function extensionConfiguration<K extends keyof ExtensionConfiguration>(
  key: K
) {
  return getConfiguration().get<ExtensionConfiguration[K]>(key);
}

export function extensionConfigurationSet<
  K extends keyof ExtensionConfiguration
>(
  key: K,
  value: ExtensionConfiguration[K],
  target = vscode.ConfigurationTarget.Global
) {
  return getConfiguration().update(key, value, target);
}

export function arrayIncludes<T>(array: T[], value: T) {
  return array.indexOf(value) !== -1;
}

export function isThenable<T>(x: vscode.ProviderResult<T>): x is Thenable<T> {
  return arrayIncludes(Object.getOwnPropertyNames(x), "then");
}

/** @deprecated */
export function getBuildFolder() {
  return extensionConfiguration("buildFolder");
}

export async function fileExists(path: string) {
  return fs.promises.access(path, fs.constants.F_OK).then(() => true).catch(() => false);
}
