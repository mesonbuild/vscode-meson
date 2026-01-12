import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import which from "which";

import { createHash, BinaryLike } from "crypto";
import { ExtensionConfiguration, Target, SettingsKey, ModifiableExtension } from "./types.js";
import { getMesonBuildOptions } from "./introspection.js";
import { extensionPath, workspaceState } from "./extension.js";

export interface ExecResult {
  stdout: string;
  stderr: string;
  timeMs: number; // Runtime in milliseconds
  error?: cp.ExecFileException;
}

export function resolveCommandAndArgs(command: string | string[], args: string[] = []): [string, string[]] {
  if (Array.isArray(command)) {
    args = [...command.slice(1), ...args];
    command = command[0];
  }

  return [command, args];
}

export async function exec(
  command: string | string[],
  args: string[],
  extraEnv: { [key: string]: string } | undefined = undefined,
  options: cp.ExecFileOptions = { shell: true },
) {
  [command, args] = resolveCommandAndArgs(command, args);

  if (extraEnv) {
    options.env = { ...(options.env ?? process.env), ...extraEnv };
  }
  return new Promise<ExecResult>((resolve, reject) => {
    const timeStart = Date.now();
    cp.execFile(command, args, options, (error, stdout, stderr) => {
      const timeMs = Date.now() - timeStart;
      if (error) {
        reject({ stdout: stdout.toString(), stderr: stderr.toString(), timeMs, error });
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), timeMs });
      }
    });
  });
}

export async function execFeed(
  command: string | string[],
  args: string[],
  options: cp.ExecFileOptions = { shell: true },
  stdin: string,
) {
  [command, args] = resolveCommandAndArgs(command, args);

  return new Promise<ExecResult>((resolve) => {
    const timeStart = Date.now();
    const p = cp.execFile(command, args, options, (error, stdout, stderr) => {
      const timeMs = Date.now() - timeStart;
      resolve({ stdout: stdout.toString(), stderr: stderr.toString(), timeMs, error: error ?? undefined });
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

function getConfiguration() {
  return vscode.workspace.getConfiguration("mesonbuild");
}

type ConfigValue<K extends keyof ExtensionConfiguration> = NonNullable<ExtensionConfiguration[K]>;

function resolveConfigurationStringValue<K extends keyof ExtensionConfiguration>(
  value: ConfigValue<K>,
): ConfigValue<K> {
  if (typeof value === "string") {
    const workspaceFolder = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0] : null;

    if (workspaceFolder && value) {
      const workspacePath = workspaceFolder.uri.fsPath;
      value = value.replace(/\${workspaceFolder}/gi, workspacePath) as ConfigValue<K>;
    }
    return value;
  } else {
    return value;
  }
}

const deprecateToStringArray = {
  mesonPath: true,
  muonPath: true,
  languageServerPath: true,
};

export function extensionConfiguration<K extends keyof ExtensionConfiguration>(key: K) {
  let value = getConfiguration().get<ExtensionConfiguration[K]>(key)!;

  if (key in deprecateToStringArray && typeof value === "string") {
    value = [value] as ConfigValue<K>;
  }

  if (typeof value === "string") {
    value = resolveConfigurationStringValue(value);
  } else if (Array.isArray(value)) {
    value = value.map(resolveConfigurationStringValue) as ConfigValue<K>;
  }
  return value;
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

export function mesonProgram(): [string, string[]] {
  const cmdArray = extensionConfiguration("mesonPath");
  return [which.sync(cmdArray[0]), cmdArray.slice(1)];
}
