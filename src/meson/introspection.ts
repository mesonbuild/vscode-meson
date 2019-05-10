import { exec } from "../utils";
import { Targets, Dependencies, BuildOptions, Test, Tests } from "./types";

const MESON_VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)/g;

export async function getMesonTargets(build: string) {
  const { stdout } = await exec("meson introspect --targets", {
    cwd: build
  });
  const parsed: Targets = JSON.parse(stdout);
  if (getMesonVersion()[1] < 50) {
    return parsed.map(t => {
      if (typeof t.filename === "string") t.filename = [t.filename]; // Old versions would directly pass a string with only 1 filename on the target
      return t;
    });
  }
  return parsed;
}
export async function getMesonBuildOptions(build: string) {
  const { stdout } = await exec("meson introspect --buildoptions", {
    cwd: build
  });
  return JSON.parse(stdout) as BuildOptions;
}
export async function getMesonDependencies(build: string) {
  const { stdout } = await exec("meson introspect --dependencies", {
    cwd: build
  });
  return JSON.parse(stdout) as Dependencies;
}
export async function getMesonTests(build: string) {
  const { stdout } = await exec("meson introspect --tests", { cwd: build });
  return JSON.parse(stdout) as Tests;
}

export async function getMesonVersion(): Promise<[number, number, number]> {
  const { stdout } = await exec("meson --version", {});
  if (MESON_VERSION_REGEX.test(stdout.trim())) {
    const match = MESON_VERSION_REGEX.exec(stdout.trim());
    return match.slice(1, 3).map(s => Number.parseInt(s)) as [
      number,
      number,
      number
    ];
  } else
    throw new Error(
      "Meson version doesn't match expected output: " + stdout.trim()
    );
}
