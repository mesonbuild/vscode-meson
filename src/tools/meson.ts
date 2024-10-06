import * as vscode from "vscode";
import { execFeed, extensionConfiguration, getOutputChannel, mesonProgram, versionCompare } from "../utils";
import { Tool } from "../types";
import { getMesonVersion } from "../introspection";

export async function format(meson: Tool, root: string, document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const originalDocumentText = document.getText();

  let args = ["format"];

  const config_path = extensionConfiguration("formatting").mesonConfig;
  if (config_path) {
    args.push("-c", config_path);
  }

  //TODO: this doesn't work, we have file a bug report upstream, that "-" (or any other notation for stdin) should be supported
  // or use hacky way and use "/dev/stdin" or "/dev/fd/0" as file
  args.push("-");

  const { stdout, stderr, error } = await execFeed(meson.path, args, { cwd: root }, originalDocumentText);
  if (error) {
    //TODO: file a bug report, meson prints error on stdout :(
    getOutputChannel().appendLine(`Failed to format document with meson: ${stderr}`);
    getOutputChannel().show(true);
    return [];
  }

  const documentRange = new vscode.Range(
    document.lineAt(0).range.start,
    document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
  );

  return [new vscode.TextEdit(documentRange, stdout)];
}

export async function check(): Promise<{ tool?: Tool; error?: string }> {
  const meson_path = mesonProgram();

  let mesonVersion;
  try {
    mesonVersion = await getMesonVersion();
  } catch (e) {
    const error = e as Error;
    console.log(error);
    return { error: error.message };
  }

  // meson format was introduced in 1.5.0
  // see https://mesonbuild.com/Commands.html#format
  if (versionCompare(mesonVersion, [1, 5, 0]) >= 0) {
    return { error: `Meson support formatting only since version 1,.5.0, but you ave version ${mesonVersion}` };
  }

  return { tool: { path: meson_path, version: mesonVersion } };
}
