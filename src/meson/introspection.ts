import { exec } from "../utils";
import { Targets, Dependencies, BuildOptions, Test } from "./types";

const MESON_VERSION_REGEX = /^(\d+)\.(\d+)\.(\d+)/g;

export async function getMesonTargets(build: string) {
  const { stdout } = await exec("meson introspect --targets", {
    cwd: build
  });
  return JSON.parse(stdout) as Targets;
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
  return [] as Test[];
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
