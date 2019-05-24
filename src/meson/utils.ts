import { existsSync, exists } from "fs";
import { join } from "path";

// TODO: Check if this is the canonical way to check if Meson is configured
export async function checkMesonIsConfigured(dir: string) {
  return (await Promise.all([
    existsP(join(dir, "meson-info")),
    existsP(join(dir, "meson-private"))
  ])).every(v => v);
}

function existsP(path: string) {
  return new Promise<boolean>(res => {
    exists(path, res);
  });
}
