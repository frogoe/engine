/** frogoe mobile preflight — the checks between "a game folder" and a
 *  live `tauri ios/android dev` loop. Exec-backed but injectable, so the
 *  parsing and resolution logic is unit-tested without toolchains. */
import { execSyncQuiet as execSync, type ExecSyncFn } from "./exec-seam.ts";
import { existsSync } from "node:fs";
import path from "node:path";

/** An available iOS simulator, as `simctl list devices available` reports. */
export interface Simulator {
  booted: boolean;
  name: string;
}

export const parseSimulators = (simctlOutput: string): Simulator[] => {
  const out: Simulator[] = [];
  for (const line of simctlOutput.split("\n")) {
    const match = /^\s{4}(.+?)\s+\([0-9A-F-]{36}\)\s+\((\w[\w-]*)\)\s*$/u.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      out.push({ booted: match[2] === "Booted", name: match[1].trim() });
    }
  }
  return out;
};

/** Prefer a booted iPhone, else the first available iPhone (devices list
 *  starts at newest OS section — the first is a sane default). */
export const pickSimulator = (sims: Simulator[]): Simulator | undefined =>
  sims.find((sim) => sim.booted) ?? sims[0];

/** Android: where the SDK lives when ANDROID_HOME is unset (studio default). */
export const androidSdkDir = (): string | undefined => {
  const env = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (env && existsSync(env)) return env;
  const studio = path.join(process.env.HOME ?? "", "Library/Android/sdk");
  return existsSync(studio) ? studio : undefined;
};

export interface AdbDevice {
  emulator: boolean;
  serial: string;
}

export const parseAdbDevices = (adbOutput: string): AdbDevice[] => {
  const out: AdbDevice[] = [];
  for (const line of adbOutput.split("\n")) {
    const match = /^(\S+)\s+device\b/u.exec(line);
    if (match && match[1] !== undefined) {
      out.push({ emulator: /^emulator-\d+$/u.test(match[1]), serial: match[1] });
    }
  }
  return out;
};

/** The devUrl an Android webview can reach the host on: the emulator's
 *  loopback alias, or the LAN address for a physical device. */
export const androidDevUrl = (
  devices: AdbDevice[],
  lanIp: string | undefined,
  port: number,
): string | undefined => {
  if (devices.some((device) => device.emulator)) return `http://10.0.2.2:${String(port)}`;
  if (devices.length > 0) {
    return lanIp !== undefined ? `http://${lanIp}:${String(port)}` : undefined;
  }
  return undefined;
};

/** Live checks used by `frogoe run ios|android` — each returns a teaching
 *  error string, or null when the path is clear. */
export const iosPreflight = (run: ExecSyncFn = execSync): string | null => {
  try {
    run("xcodebuild -version");
  } catch {
    return "frogoe run ios: Xcode not found — install it from the App Store and run `xcode-select --install`, then retry";
  }
  return null;
};

export const simulatorList = (run: ExecSyncFn = execSync): Simulator[] => {
  try {
    return parseSimulators(run("xcrun simctl list devices available"));
  } catch {
    return [];
  }
};

export const adbDeviceList = (sdkDir: string, run: ExecSyncFn = execSync): AdbDevice[] => {
  const adb = path.join(sdkDir, "platform-tools", "adb");
  try {
    return parseAdbDevices(run(`"${adb}" devices`));
  } catch {
    return [];
  }
};
