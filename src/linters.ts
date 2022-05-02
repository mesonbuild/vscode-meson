import * as vscode from 'vscode';
import {
  extensionConfiguration
} from "./utils";
import {
  LinterConfiguration,
  ToolCheckFunc
} from "./types"
import * as muon from "./tools/muon";

type LinterFunc = (
  linter_path: string,
  sourceRoot: string,
  diagnosticCollection: vscode.DiagnosticCollection,
  document: vscode.TextDocument
) => void

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

async function reloadLinters(sourceRoot: string, context: vscode.ExtensionContext): Promise<vscode.Disposable[]> {
  let disposables = [];

  if (!extensionConfiguration("linting").enabled) {
    return disposables;
  }

  for (const [name, props] of Object.entries(linters)) {
    const config: LinterConfiguration = extensionConfiguration("linter")[name];

    if (!config.enabled) {
      continue;
    }

    const linter_path = await props.check();
    if (!linter_path) {
        continue;
    }

    const diagnosticCollection = vscode.languages.createDiagnosticCollection(`mesonbuild.linters.${name}`);

    const linter = (document: vscode.TextDocument) => {
      props.lint(linter_path, sourceRoot, diagnosticCollection, document)
    }

    const subscriptions = [
      vscode.workspace.onDidChangeTextDocument(c => linter(c.document)),
      vscode.window.onDidChangeActiveTextEditor(e => { if (e) { linter(e.document) } }),
      diagnosticCollection
    ]

    for (const sub of subscriptions) {
      context.subscriptions.push(sub);
      disposables.push(sub);
    }
  }

  return disposables;
}

export async function activateLinters(sourceRoot: string, context: vscode.ExtensionContext) {
  let subscriptions: vscode.Disposable[] = await reloadLinters(sourceRoot, context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async () => {
      for (let handler of subscriptions) {
        handler.dispose();
      }

      subscriptions = await reloadLinters(sourceRoot, context);
    })
  );
}
