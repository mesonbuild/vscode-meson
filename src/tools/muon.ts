import * as vscode from 'vscode';
import * as cp from 'child_process';
import {
  exec,
  execFeed,
  extensionConfiguration,
  getOutputChannel
} from "../utils"
import {
  Tool
} from "../types"

export async function lint(
  muon: Tool,
  root: string,
  document: vscode.TextDocument
): Promise<vscode.Diagnostic[]> {
  const { error, stdout, stderr } = await execFeed(
    muon.path,
    ["analyze", "-l", "-O", document.uri.fsPath],
    { cwd: root },
    document.getText()
  )

  let diagnostics: vscode.Diagnostic[] = [];
  stderr.split("\n").forEach(line => {
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

export async function format(
  muon: Tool,
  document: vscode.TextDocument
): Promise<vscode.TextEdit[]> {
  const originalDocumentText = document.getText();

  let args = ["fmt"]

  if (muon.version[0] == 0 && muon.version[1] == 0) {
    args = ["fmt_unstable"]
  }

  const config_path = extensionConfiguration("formatting").muonConfig
  if (config_path) {
    args.push("-c", config_path)
  }
  args.push("-")

  const { stdout, stderr, error } = await execFeed(muon.path, args, {}, originalDocumentText);
  if (error) {
    getOutputChannel().appendLine(`Failed to format document with muon: ${stderr}`)
    getOutputChannel().show(true);
    return [];
  }

  const documentRange = new vscode.Range(
    document.lineAt(0).range.start,
    document.lineAt(document.lineCount - 1).rangeIncludingLineBreak.end,
  );

  return [new vscode.TextEdit(documentRange, stdout)];
}

export async function check(): Promise<{ tool: Tool, error: string }> {
  const muon_path = extensionConfiguration("muonPath");

  const undef_muon = { path: undefined, version: undefined };

  let stdout: string, stderr: string;

  try {
    ({ stdout, stderr } = await exec(muon_path, ["version"]))
  } catch (exception) {
    const { error, stdout, stderr }: { error: cp.ExecException, stdout: string, stderr: string } = exception;
    console.log(error);
    return { tool: undef_muon, error: error.message };
  }

  const line1 = stdout.split("\n")[0].split(" ")
  if (line1.length !== 2) {
    return { tool: undef_muon, error: `Invalid version string: ${line1}` };
  }

  const ver = line1[1].split("-")[0].split('.').map((s) => {
    if (s[0] == 'v') {
      s = s.slice(1)
    }

    return Number.parseInt(s)
  }) as [number, number, number];

  return { tool: { path: muon_path, version: ver }, error: undefined };
}
