import * as vscode from "vscode";
import { ExecResult, exec, execFeed, extensionConfiguration, getOutputChannel } from "../utils.js";
import { Tool, CheckResult } from "../types.js";
import { Version, type VersionArray } from "../version.js";

export interface MuonOptions {}

export type MuonTool = Tool<MuonOptions>;

export async function lint(muon: MuonTool, root: string, document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
  const { stdout, stderr } = await execFeed(
    muon.path,
    ["analyze", "-l", "-O", document.uri.fsPath],
    { cwd: root },
    document.getText(),
  );

  let out: string;
  // if (muonVersion < 0.4.0)
  if (muon.version.compare([0, 4, 0]) < 0) {
    out = stderr;
  } else {
    out = stdout;
  }

  let diagnostics: vscode.Diagnostic[] = [];
  out.split("\n").forEach((line) => {
    const parts = line.split(":");
    if (parts.length < 4) {
      return;
    }

    const file = parts[0];
    const line_no = Number(parts[1]);
    const col = Number(parts[2]);
    const fullmsg = parts.slice(3).join(":").trim();

    if (file != document.uri.fsPath) {
      return;
    }

    const range = new vscode.Range(line_no - 1, col, line_no - 1, col);

    let severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error;
    if (fullmsg.startsWith("warn")) {
      severity = vscode.DiagnosticSeverity.Warning;
    }

    const msg = fullmsg.slice(fullmsg.indexOf(" ") + 1);

    const diagnostic = new vscode.Diagnostic(range, msg, severity);
    diagnostics.push(diagnostic);
  });

  return diagnostics;
}

export async function format(muon: MuonTool, root: string, document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const originalDocumentText = document.getText();

  let args = ["fmt"];

  // if (muonVersion < 0.1.0)
  if (muon.version.compare([0, 1, 0]) < 0) {
    args = ["fmt_unstable"];
  }

  const config_path = extensionConfiguration("formatting").muonConfig;
  if (config_path) {
    args.push("-c", config_path);
  }
  args.push("-");

  const { stdout, stderr, error } = await execFeed(muon.path, args, { cwd: root }, originalDocumentText);
  if (error) {
    getOutputChannel().appendLine(`Failed to format document with muon: ${stderr}`);
    getOutputChannel().show(true);
    return [];
  }

  const documentRange = new vscode.Range(
    document.lineAt(0).range.start,
    document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
  );

  return [new vscode.TextEdit(documentRange, stdout)];
}

export async function check(): Promise<CheckResult<MuonTool>> {
  const muon_path = extensionConfiguration("muonPath");
  let stdout: string, stderr: string;

  try {
    ({ stdout, stderr } = await exec(muon_path, ["version"]));
  } catch (e) {
    const { error, stdout, stderr } = e as ExecResult;
    console.log(error);
    return CheckResult.newError<MuonTool>(error!.message);
  }

  const line1 = stdout.split("\n")[0].split(" ");
  if (line1.length !== 2) {
    return CheckResult.newError<MuonTool>(`Invalid version string: ${line1}`);
  }

  const ver = line1[1]
    .split("-")[0]
    .split(".")
    .map((s) => {
      if (s[0] == "v") {
        s = s.slice(1);
      }

      return Number.parseInt(s);
    }) as VersionArray;

  const options: MuonOptions = {};

  return CheckResult.newData<MuonTool>({ path: muon_path, version: new Version(ver), options });
}
