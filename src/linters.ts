import * as vscode from 'vscode';
import {
  extensionConfiguration,
  getOutputChannel,
} from "./utils";
import {
  LinterConfiguration,
  ToolCheckFunc
} from "./types"
import * as muon from "./tools/muon";

type LinterFunc = (
  linter_path: string,
  sourceRoot: string,
  document: vscode.TextDocument
) => Promise<vscode.Diagnostic[]>

type LinterDefinition = {
  lint: LinterFunc,
  check: ToolCheckFunc
}

const linters: Record<string, LinterDefinition> = {
  muon: {
    lint: muon.lint,
    check: muon.check,
  }
}

async function reloadLinters(sourceRoot: string, context: vscode.ExtensionContext, diagnostics: vscode.DiagnosticCollection): Promise<vscode.Disposable[]> {
  let disposables = [];

  if (!extensionConfiguration("linting").enabled) {
    return disposables;
  }

  for (const [name, props] of Object.entries(linters)) {
    const config: LinterConfiguration = extensionConfiguration("linter")[name];

    if (!config.enabled) {
      continue;
    }

    const { path, error } = await props.check();
    if (error) {
      getOutputChannel().appendLine(`Failed to enable linter ${name}: ${error}`)
      getOutputChannel().show(true);
      continue;
    }

    const linter = async (document: vscode.TextDocument) => {
      diagnostics.set(document.uri, await props.lint(path, sourceRoot, document));
    }

    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument(c => linter(c.document)),
      vscode.window.onDidChangeActiveTextEditor(e => { if (e) { linter(e.document) } }),
    ]

    for (const sub of subscriptions) {
      context.subscriptions.push(sub);
      disposables.push(sub);
    }
  }

  return disposables;
}

export async function activateLinters(sourceRoot: string, context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('meson');

  let subscriptions: vscode.Disposable[] = await reloadLinters(sourceRoot, context, diagnostics);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async () => {
      for (let handler of subscriptions) {
        handler.dispose();
      }

      diagnostics.clear();
      subscriptions = await reloadLinters(sourceRoot, context, diagnostics);
    })
  );
}
