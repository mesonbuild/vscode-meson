import * as vscode from 'vscode';
import {
  extensionConfiguration,
  getOutputChannel,
} from "./utils";
import {
  ExtensionConfiguration,
  LinterConfiguration,
  ToolCheckFunc,
  Tool
} from "./types"
import * as muon from "./tools/muon";

type LinterFunc = (
  tool: Tool,
  sourceRoot: string,
  document: vscode.TextDocument
) => Promise<vscode.Diagnostic[]>

type LinterDefinition = {
  lint: LinterFunc,
  check: ToolCheckFunc
}

const linters: Record<keyof ExtensionConfiguration["linter"], LinterDefinition> = {
  muon: {
    lint: muon.lint,
    check: muon.check,
  }
}

async function reloadLinters(sourceRoot: string, context: vscode.ExtensionContext, diagnostics: vscode.DiagnosticCollection) {
  let disposables: vscode.Disposable[] = [];

  if (!extensionConfiguration("linting").enabled) {
    return disposables;
  }

  let enabledLinters: ((document: vscode.TextDocument) => Promise<vscode.Diagnostic[]>)[] = [];
  let name: keyof typeof linters;

  for (name in linters) {
    const config: LinterConfiguration = extensionConfiguration("linter")[name];
    if (!config.enabled) {
      continue;
    }

    const props = linters[name];
    const { tool, error } = await props.check();
    if (error) {
      getOutputChannel().appendLine(`Failed to enable linter ${name}: ${error}`)
      getOutputChannel().show(true);
      continue;
    }

    const linter = async (document: vscode.TextDocument) => await props.lint(tool!, sourceRoot, document)
    enabledLinters.push(linter);
  }

  const lintAll = (document: vscode.TextDocument) => {
    if (document.languageId != 'meson') {
      return;
    }

    Promise.all(enabledLinters.map(l => l(document))).then(values => {
      diagnostics.set(document.uri, values.flat());
    })
  }

  const subscriptions = [
    vscode.workspace.onDidChangeTextDocument(c => lintAll(c.document)),
    vscode.window.onDidChangeActiveTextEditor(e => { if (e) { lintAll(e.document) } }),
  ]

  for (const sub of subscriptions) {
    context.subscriptions.push(sub);
    disposables.push(sub);
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
