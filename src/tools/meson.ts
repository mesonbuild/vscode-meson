import * as vscode from "vscode";
import { execFeed, extensionConfiguration, getOutputChannel, mesonProgram } from "../utils";
import { Tool, type ToolCheckResult } from "../types";
import { getMesonVersion } from "../introspection";
import { Version } from "../version";

export async function format(meson: Tool, root: string, document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const originalDocumentText = document.getText();

  let args = ["format"];

  const config_path = extensionConfiguration("formatting").mesonConfig;
  if (config_path) {
    args.push("-c", config_path);
  }
  args.push("-");

  const { stdout, stderr, error } = await execFeed(meson.path, args, { cwd: root }, originalDocumentText);
  if (error) {
    //TODO: file a bug report, meson prints some errors on stdout :(
    const errorString = stderr.trim().length > 0 ? stderr : stdout;

    getOutputChannel().appendLine(`Failed to format document with meson: ${errorString}`);
    getOutputChannel().show(true);
    return [];
  }

  const documentRange = new vscode.Range(
    document.lineAt(0).range.start,
    document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
  );

  return [new vscode.TextEdit(documentRange, stdout)];
}

const formattingSupportedSinceVersion = new Version([1, 5, 0]);
const formattingWithStdinSupportedSinceVersion = new Version([1, 7, 0]);

export async function check(): Promise<ToolCheckResult> {
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
  if (mesonVersion.compareWithOther(formattingSupportedSinceVersion) < 0) {
    return {
      error: `Meson support formatting only since version ${formattingSupportedSinceVersion}, but you have version ${mesonVersion}`,
    };
  }

  //TODO: this isn't released yet, so wait until it is, as 1.7.0 is only a guess of the author of the PR, it could also end in 1.6.1 or some other version
  // using "-" as stdin is only supported since 1.7.0 (see https://github.com/mesonbuild/meson/pull/13793)
  if (mesonVersion.compareWithOther(formattingWithStdinSupportedSinceVersion) < 0) {
    return {
      error: `Meson supports formatting from stdin only since version ${formattingWithStdinSupportedSinceVersion}, but you have version ${mesonVersion}`,
    };
  }

  return { tool: { path: meson_path, version: mesonVersion } };
}
