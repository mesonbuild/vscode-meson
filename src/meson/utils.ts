import { existsSync } from "fs";
import { join } from "path";

// meson setup --reconfigure is needed if and only if coredata.dat exists.
// Note: With Meson >= 1.1.0 we can always pass --reconfigure even if it was
// not already configured.
export function checkMesonIsConfigured(buildDir: string) {
  return existsSync(join(buildDir, "meson-private", "coredata.dat"))
}
