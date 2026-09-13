/** The exec seam — one typed surface so command-flavored helpers stay
 *  unit-testable with a fake runner (no toolchains in CI). The default
 *  runs for real; tests pass a pure function. */
import { execSync } from "node:child_process";

export type ExecSyncFn = (command: string) => string;

export const execSyncQuiet = (command: string): string =>
  execSync(command, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
