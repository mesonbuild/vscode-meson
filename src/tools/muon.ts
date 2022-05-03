import * as vscode from 'vscode';
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

export async function check(): Promise<string> {
  const muon_path = extensionConfiguration("muonPath");

  const {stdout, stderr, error} = await exec(muon_path, ["version"])
  if (error) {
    return undefined;
  }

  const line1 = stdout.split("\n")[0].split(" ")
  if (line1.length !== 2) {
    return undefined;
  }

  const ver = line1[1].split("-")[0]
  // TODO: when muon its first release, use a real version comparison function
  if (ver !== "v0.0.1") {
      return undefined;
  }

  return muon_path;
}
