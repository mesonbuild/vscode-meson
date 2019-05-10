import * as vscode from "vscode";
import { exec, execAsTask, getOutputChannel } from "../utils";
import { getBuildTask } from "../tasks";

export async function runMesonConfigure(source: string, build: string) {
  try {
    vscode.window.showInformationMessage(`Configuring meson into '${build}'`);
    await exec(`meson ${build}`, { cwd: source });
    vscode.window.showInformationMessage("Configured!");
    return true;
  } catch (e) {
    vscode.window.showInformationMessage("Meson is already configured.");
    return false;
  }
}

export async function runMesonReconfigure() {
  try {
    await vscode.tasks.executeTask(await getBuildTask("reconfigure"));
  } catch (e) {
    vscode.window.showErrorMessage("Couldn't reconfigure project.");
  }
}

export async function runMesonBuild(name?: string) {
  try {
    await vscode.tasks.executeTask(await getBuildTask(name));
  } catch (e) {
    vscode.window.showErrorMessage("Build failed.\n\n" + e);
  }
}

export async function runMesonTests(build: string, name?: string) {
  try {
    if (name) return await execAsTask(`meson test ${name}`, { cwd: build });
    return await execAsTask("ninja test", { cwd: build });
  } catch (e) {
    if (e.stderr) {
      vscode.window.showErrorMessage("Tests failed.");
    }
  }
}
