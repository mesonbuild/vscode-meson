import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as vscode from "vscode";
import { createHash, BinaryLike } from "crypto";
import { ExtensionConfiguration, Target } from "./types";
import { getMesonBuildOptions } from "./introspection";
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

export function workspaceRelative(filepath: string) {
  return path.resolve(vscode.workspace.rootPath, filepath);
}

let _layout_promise: Promise<string> | undefined = undefined;;

async function getLayout() {
  const buildDir = workspaceRelative(extensionConfiguration("buildFolder"));
  const buildOptions = await getMesonBuildOptions(buildDir);
  return buildOptions.filter(o => o.name === "layout")[0].value;
}

export function clearCache() {
  _layout_promise = undefined
}

export async function getTargetName(target: Target) {
  if (!_layout_promise) {
    _layout_promise = getLayout();
  }
  const layout = await _layout_promise;

  if (layout === "mirror") {
    let relativePath = path.relative(vscode.workspace.rootPath, path.dirname(target.defined_in));

    // Meson requires the separator between path and target name to be '/'.
    relativePath = path.join(relativePath, target.name);
    const p = relativePath.split(path.sep).join(path.posix.sep);
    return `${p}:${target.type.replace(" ", "_")}`

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

let _envDict: { [key: string]: string } | undefined = undefined;

export async function genEnvFile(buildDir: string) {
  const envfile = path.join(buildDir, "meson-vscode.env")
  try {
    await exec(
      extensionConfiguration("mesonPath"), ["devenv", "-C", buildDir, "--dump", envfile, "--dump-format", "vscode"]);
  } catch {
    // Ignore errors, Meson could be too old to support --dump-format.
    return;
  }

  // Load into a dict because vscode.ProcessExecution() does not support envFile.
  _envDict = {}
  const data = await fs.promises.readFile(envfile);
  for (const i of data.toString().split(/\r?\n/)) {
    // Poor man's i.split("=", 1), JS won't return part after first equal sign.
    // Value is quoted, remove first and last " char and also possible \r ending.
    const index = i.indexOf('=');
    const key = i.substring(0, index);
    const value = i.slice(index + 2, -1);
    _envDict[key] = value;
  }
}

export function getEnvDict() {
  return _envDict;
}

export async function patchCompileCommands(buildDir: string) {
  const filePath = path.join(buildDir, "compile_commands.json");
  let db = await parseJSONFileIfExists(filePath);
  if (!db)
    return;

  // Remove ccache from compile commands because they confuse Intellisense:
  // https://github.com/microsoft/vscode-cpptools/issues/7616
  Object.values(db).forEach((entry) => {
    // FIXME: This should use proper shlex.split() and shlex.join()
    let cmd = entry["command"].split(" ");
    if (cmd[0].endsWith("ccache")) {
      cmd.shift();
      entry["command"] = cmd.join(" ");
    }
  });
  const vsCodeFilePath = path.join(buildDir, "vscode_compile_commands.json")
  fs.writeFileSync(vsCodeFilePath, JSON.stringify(db, null, "  "));

  // Since we have compile_commands.json, make sure we use it.
  try {
    const relFilePath = path.relative(vscode.workspace.rootPath, vsCodeFilePath);
    const conf = vscode.workspace.getConfiguration("C_Cpp");
    conf.update("default.compileCommands", relFilePath, vscode.ConfigurationTarget.Workspace);
  } catch {
      // Ignore, C/C++ extension might not be installed
  }
}

// meson setup --reconfigure is needed if and only if coredata.dat exists.
// Note: With Meson >= 1.1.0 we can always pass --reconfigure even if it was
// not already configured.
export function checkMesonIsConfigured(buildDir: string) {
  return fs.existsSync(path.join(buildDir, "meson-private", "coredata.dat"))
}
