import * as vscode from 'vscode';
import * as cp from 'child_process';
import {
  exec,
  execFeed,
  extensionConfiguration,
  getOutputChannel
} from "../utils"

export async function lint(
  muon_path: string,
  root: string,
  diagnosticCollection: vscode.DiagnosticCollection,
  document: vscode.TextDocument
) {
  diagnosticCollection.clear();

  const { error, stdout, stderr } = await execFeed(
    muon_path,
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

  diagnosticCollection.set(document.uri, diagnostics);
}

export async function format(
  muon_path: string,
  document: vscode.TextDocument
): Promise<vscode.TextEdit[]> {
  const originalDocumentText = document.getText();

  let args = ["fmt_unstable"]

  const config_path = extensionConfiguration("formatting").muonConfig
  if (config_path) {
    args.push("-c", config_path)
  }
  args.push("-")

  const { stdout, stderr, error } = await execFeed(muon_path, args, {}, originalDocumentText);
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

export async function check(): Promise<{ path: string, error: string }> {
  const muon_path = extensionConfiguration("muonPath");

  let stdout: string, stderr: string;

  try {
    ({ stdout, stderr } = await exec(muon_path, ["version"]))
  } catch (exception) {
    const {error, stdout, stderr}: {error: cp.ExecException, stdout: string, stderr: string} = exception;
    return { path: undefined, error: error.message };
  }

  const line1 = stdout.split("\n")[0].split(" ")
  if (line1.length !== 2) {
    return { path: undefined, error: `Invalid version string: ${line1}` };
  }

  const ver = line1[1].split("-")[0]
  // TODO: when muon has a release, use a real version comparison function
  const expected = "v0.0.1";
  if (ver !== expected) {
      return { path: undefined, error: `Muon version mismatch: ${ver} != ${expected}` };
  }

  return { path: muon_path, error: undefined };
}
