import * as vscode from "vscode";
import {
  exec,
  execAsTask,
  getOutputChannel,
  extensionConfiguration,
  execStream
} from "../utils";
import { getTask } from "../tasks";
import { relative } from "path";
import { checkMesonIsConfigured } from "./utils";

export async function runMesonConfigure(source: string, build: string) {
  return vscode.window.withProgress(
    {
      title: "Configuring",
      location: vscode.ProgressLocation.Notification,
      cancellable: false
    },
    async progress => {
      progress.report({
        message: `Checking if Meson is configured in ${relative(
          source,
          build
        )}...`
      });
      if (await checkMesonIsConfigured(build)) {
        progress.report({
          message: "Applying configure options...",
          increment: 30
        });
        await exec(
          `meson configure ${extensionConfiguration("configureOptions").join(
            " "
          )} ${build}`,
          { cwd: source }
        );
        progress.report({ message: "Reconfiguring build...", increment: 60 });
        await exec("ninja reconfigure", { cwd: build });
      } else {
        progress.report({
          message: `Configuring Meson into ${relative(source, build)}...`
        });
        const configureOpts = extensionConfiguration("configureOptions").join(
          " "
        );
        const { stdout, stderr } = await exec(
          `meson ${configureOpts} ${build}`,
          { cwd: source }
        );
        getOutputChannel().appendLine(stdout);
        getOutputChannel().appendLine(stderr);
        if (stderr.length > 0) getOutputChannel().show(true);
      }
      progress.report({ message: "Done.", increment: 100 });
      return new Promise(res => setTimeout(res, 2000));
    }
  );
}

export async function runMesonReconfigure() {
  try {
    await vscode.tasks.executeTask(await getTask("reconfigure"));
  } catch (e) {
    vscode.window.showErrorMessage("Couldn't reconfigure project.");
    getOutputChannel().appendLine("Reconfiguring Meson:");
    getOutputChannel().appendLine(e);
    getOutputChannel().show(true);
  }
}

export async function runMesonBuild(buildDir: string, name?: string) {
  let command = !!name ? `ninja ${name}` : "ninja";
  const stream = execStream(command, { cwd: buildDir });

  return vscode.window.withProgress(
    {
      title: name ? `Building target ${name}` : "Building project",
      location: vscode.ProgressLocation.Notification,
      cancellable: true
    },
    async (progress, token) => {
      token.onCancellationRequested(() => stream.kill());
      let oldPercentage = 0;
      stream.onLine((msg, isError) => {
        const match = /^\[(\d+)\/(\d+)\] (.*)/g.exec(msg);
        if (match) {
          const percentage = (100 * parseInt(match[1])) / parseInt(match[2]);
          const increment = percentage - oldPercentage;
          oldPercentage = percentage;
          if (increment > 0) progress.report({ increment, message: match[3] });
        }
        getOutputChannel().append(msg);
        if (isError) getOutputChannel().show(true);
      });

      await stream.finishP().then(code => {
        if (code !== 0)
          throw new Error(
            "Build failed. See Meson Build output for more details."
          );
      });
      progress.report({ message: "Build finished.", increment: 100 });
      await new Promise(res => setTimeout(res, 5000));
    }
  );
}

export async function runMesonTests(build: string, name?: string) {
  try {
    if (name)
      return await execAsTask(
        `meson test ${name}`,
        { cwd: build },
        vscode.TaskRevealKind.Always
      );
    return await execAsTask(
      "ninja test",
      { cwd: build },
      vscode.TaskRevealKind.Always
    );
  } catch (e) {
    if (e.stderr) {
      vscode.window.showErrorMessage("Tests failed.");
    }
  }
}
