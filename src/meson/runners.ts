import * as vscode from "vscode";
import { exec, getOutputChannel } from "../utils";

export async function runMesonConfigure(source: string, build: string) {
  try {
    vscode.window.showInformationMessage(`Configuring meson into '${build}'`);
    const { stdout, stderr } = await exec(`meson ${build}`, { cwd: source });
    vscode.window.showInformationMessage("Configured!");
    getOutputChannel().appendLine(stdout);
    getOutputChannel().appendLine(stderr);
    return true;
  } catch (e) {
    vscode.window.showInformationMessage("Meson is already configured.");
    return false;
  }
}

export async function runMesonReconfigure(build: string) {
  try {
    vscode.window.showInformationMessage("Force reconfiguring project...");
    const { stdout, stderr } = await exec("ninja reconfigure", { cwd: build });
    vscode.window.showInformationMessage("Done!");
    getOutputChannel().appendLine(stdout);
    getOutputChannel().appendLine(stderr);
  } catch (e) {
    vscode.window.showErrorMessage(
      "Couldn't reconfigure project. See output tab for more info."
    );
    if (e.stderr) {
      getOutputChannel().appendLine(e.stderr);
      getOutputChannel().show(true);
    }
  }
}

export async function runMesonBuild(build: string, name?: string) {
  try {
    vscode.window.showInformationMessage(
      `Building ${!!name ? name : "project"}`
    );
    const { stdout, stderr } = await exec(
      "ninja" + (!!name ? ` ${name}` : ""),
      { cwd: build }
    );
    getOutputChannel().appendLine(stdout);
    getOutputChannel().appendLine(stderr);
    vscode.window.showInformationMessage("Done!");
  } catch (e) {
    vscode.window.showErrorMessage(
      "Build failed. See output tab for more info."
    );
    if (e.stderr) {
      getOutputChannel().appendLine(e.stderr);
      getOutputChannel().show(true);
    }
  }
}

export async function runMesonTest(build: string, name?: string) {
  try {
    const { stdout, stderr } = await exec(
      "ninja test" + (!!name ? ` ${name}` : ""),
      {
        cwd: build
      }
    );
    getOutputChannel().appendLine(stdout);
    getOutputChannel().appendLine(stderr);
  } catch (e) {
    if (e.stderr) {
      vscode.window.showErrorMessage(
        "Tests failed. See output tab for more info."
      );
      getOutputChannel().appendLine(e.stderr);
      getOutputChannel().show(true);
    }
  }
}
