import * as vscode from "vscode";
import { execFeed, extensionConfiguration, getOutputChannel } from "../utils.js";
import { Tool, CheckResult } from "../types.js";
import { getMesonVersion } from "../introspection.js";
import { Version } from "../version.js";

export interface MesonOptions {
  supportsFileNameArgument: boolean;
}

export type MesonTool = Tool<MesonOptions>;

export async function format(
  meson: MesonTool,
  root: string,
  document: vscode.TextDocument,
): Promise<vscode.TextEdit[]> {
  const originalDocumentText = document.getText();

  let args = ["format"];

  const config_path = extensionConfiguration("formatting").mesonConfig;
  if (config_path) {
    args.push("-c", config_path);
  }
  args.push("-");

  if (meson.options.supportsFileNameArgument) {
    args.push("--source-file-path", document.fileName);
  }

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
const formattingWithFileNameArgumentSinceVersion = new Version([1, 9, 0]);

export async function check(): Promise<CheckResult<MesonTool>> {
  let mesonVersion;
  try {
    mesonVersion = await getMesonVersion();
  } catch (e) {
    const error = e as Error;
    console.log(error);
    return CheckResult.newError<MesonTool>(error.message);
  }

  // meson format was introduced in 1.5.0
  // see https://mesonbuild.com/Commands.html#format
  if (mesonVersion.compareWithOther(formattingSupportedSinceVersion) < 0) {
    return CheckResult.newError<MesonTool>(
      `Meson supports formatting only since version ${formattingSupportedSinceVersion}, but you have version ${mesonVersion}`,
    );
  }

  // using "-" as stdin is only supported since 1.7.0 (see https://github.com/mesonbuild/meson/pull/13793)
  if (mesonVersion.compareWithOther(formattingWithStdinSupportedSinceVersion) < 0) {
    return CheckResult.newError<MesonTool>(
      `Meson supports formatting from stdin only since version ${formattingWithStdinSupportedSinceVersion}, but you have version ${mesonVersion}`,
    );
  }

  const supportsFileNameArgument = mesonVersion.compareWithOther(formattingWithFileNameArgumentSinceVersion) >= 0;

  const options: MesonOptions = {
    supportsFileNameArgument,
  };

  return CheckResult.newData<MesonTool>({
    path: extensionConfiguration("mesonPath"),
    version: mesonVersion,
    options: options,
  });
}
