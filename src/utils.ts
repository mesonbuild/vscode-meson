import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import * as which from "which";

import { createHash, BinaryLike } from "crypto";
import {
  ExtensionConfiguration,
  Target,
  SettingsKey,
  ModifiableExtension,
  type ToolCheckResult,
  type ToolCheckErrorResult,
} from "./types";
import { getMesonBuildOptions } from "./introspection";
import { extensionPath, workspaceState } from "./extension";

export interface ExecResult {
  stdout: string;
  stderr: string;
  timeMs: number; // Runtime in milliseconds
  error?: cp.ExecFileException;
}

export async function exec(
  command: string,
  args: string[],
  extraEnv: { [key: string]: string } | undefined = undefined,
  options: cp.ExecFileOptions = { shell: true },
) {
  if (extraEnv) {
    options.env = { ...(options.env ?? process.env), ...extraEnv };
  }
  return new Promise<ExecResult>((resolve, reject) => {
    const timeStart = Date.now();
    cp.execFile(command, args, options, (error, stdout, stderr) => {
      const timeMs = Date.now() - timeStart;
      if (error) {
        reject({ stdout, stderr, timeMs, error });
      } else {
        resolve({ stdout, stderr, timeMs });
      }
    });
  });
}

export async function execFeed(
  command: string,
  args: string[],
  options: cp.ExecFileOptions = { shell: true },
  stdin: string,
) {
  return new Promise<ExecResult>((resolve) => {
    const timeStart = Date.now();
    const p = cp.execFile(command, args, options, (error, stdout, stderr) => {
      const timeMs = Date.now() - timeStart;
      resolve({ stdout, stderr, timeMs, error: error ?? undefined });
    });

    p.stdin?.write(stdin);
    p.stdin?.end();
  });
}

export async function parseJSONFileIfExists<T = object>(path: string) {
  try {
    const data = await fs.promises.readFile(path);
    return JSON.parse(data.toString()) as T;
  } catch (err) {
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

export function getBuildDirectory(sourceDir: string) {
  const buildDir = extensionConfiguration("buildFolder");
  if (path.isAbsolute(buildDir)) return buildDir;
  return path.join(sourceDir, buildDir);
}

let _layoutPromise: Promise<string> | null = null;

async function getLayout() {
  const buildDir = workspaceState.get<string>("mesonbuild.buildDir")!;
  const buildOptions = await getMesonBuildOptions(buildDir);
  return buildOptions.filter((o) => o.name === "layout")[0].value;
}

export function clearCache() {
  _layoutPromise = null;
}

export async function getTargetName(target: Target) {
  _layoutPromise ??= getLayout();
  const layout = await _layoutPromise;

  if (layout === "mirror") {
    const relativePath = path.relative(
      workspaceState.get<string>("mesonbuild.sourceDir")!,
      path.dirname(target.defined_in),
    );

    // Meson requires the separator between path and target name to be '/'.
    const targetRelativePath = path.join(relativePath, target.name);
    const p = targetRelativePath.split(path.sep).join(path.posix.sep);
    return `${p}:${target.type.replace(" ", "_")}`;
  } else {
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

export function extensionConfiguration<K extends keyof ExtensionConfiguration>(key: K) {
  return getConfiguration().get<ExtensionConfiguration[K]>(key)!;
}

export function extensionConfigurationSet<K extends keyof ExtensionConfiguration>(
  key: K,
  value: ExtensionConfiguration[K],
  target = vscode.ConfigurationTarget.Global,
) {
  return getConfiguration().update(key, value, target);
}

export function shouldModifySetting(key: ModifiableExtension) {
  const modifySettings = extensionConfiguration(SettingsKey.modifySettings);
  if (typeof modifySettings == "boolean") return modifySettings;
  if (modifySettings.includes(key)) return true;
  return false;
}

export function arrayIncludes<T>(array: T[], value: T) {
  return array.indexOf(value) !== -1;
}

export function isThenable<T>(x: vscode.ProviderResult<T>): x is Thenable<T> {
  return arrayIncludes(Object.getOwnPropertyNames(x), "then");
}

export async function genEnvFile(buildDir: string) {
  const envfile = path.join(buildDir, "meson-vscode.env");
  try {
    await exec(extensionConfiguration("mesonPath"), [
      "devenv",
      "-C",
      buildDir,
      "--dump",
      envfile,
      "--dump-format",
      "vscode",
    ]);
  } catch {
    // Ignore errors, Meson could be too old to support --dump-format.
    return;
  }
}

// meson setup --reconfigure is needed if and only if coredata.dat exists.
// Note: With Meson >= 1.1.0 we can always pass --reconfigure even if it was
// not already configured.
export function checkMesonIsConfigured(buildDir: string) {
  return fs.existsSync(path.join(buildDir, "meson-private", "coredata.dat"));
}

export async function mesonRootDirs(): Promise<string[]> {
  let rootDirs: string[] = [];
  let pending: vscode.Uri[] = [];
  vscode.workspace.workspaceFolders!.forEach((i) => pending.push(i.uri));
  while (true) {
    const d = pending.pop();
    if (!d) break;
    let hasMesonFile: boolean = false;
    let subdirs: vscode.Uri[] = [];
    for (const [name, type] of await vscode.workspace.fs.readDirectory(d)) {
      if (type & vscode.FileType.File && name == "meson.build") {
        rootDirs.push(d.fsPath);
        hasMesonFile = true;
        break;
      } else if (type & vscode.FileType.Directory) {
        subdirs.push(vscode.Uri.joinPath(d, name));
      }
    }
    if (!hasMesonFile) {
      pending.push(...subdirs);
    }
  }

  return rootDirs;
}

export function whenFileExists(ctx: vscode.ExtensionContext, file: string, listener: () => void) {
  const watcher = vscode.workspace.createFileSystemWatcher(file, false, true, true);
  watcher.onDidCreate(listener);
  ctx.subscriptions.push(watcher);
  if (fs.existsSync(file)) {
    listener();
  }
}

export function mesonProgram(): string {
  return which.sync(extensionConfiguration("mesonPath"));
}
