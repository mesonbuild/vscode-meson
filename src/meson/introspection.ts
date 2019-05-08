import { exec } from "../utils";
import { Targets, Dependencies, BuildOptions, Test } from "./types";

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
