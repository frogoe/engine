import { describe, expect, test } from "bun:test";
/** frogoe mobile preflight — parsing + resolution, no toolchains. */
import { androidDevUrl, parseAdbDevices, parseSimulators, pickSimulator } from "../src/mobile.ts";

const SIMCTL_SAMPLE = `== Devices ==
-- iOS 26.5 --
    iPhone 17 Pro (944DBD4F-8D56-41DC-8CDC-A1FF2E836C56) (Shutdown)
    iPhone 17 Pro Max (76F90B8C-9411-4006-B2C8-89D93A50895A) (Shutdown)
-- iOS 18.5 --
    iPhone SE (3rd generation) (1B81BCD2-3902-4867-ACC1-3832E325F70B) (Booted)

== Unavailable ==`;

describe("simctl parsing", () => {
  test("parses available devices, skips headers and unavailable", () => {
    const sims = parseSimulators(SIMCTL_SAMPLE);
    expect(sims.map((sim) => sim.name)).toEqual([
      "iPhone 17 Pro",
      "iPhone 17 Pro Max",
      "iPhone SE (3rd generation)",
    ]);
    expect(sims[2]?.booted).toBeTrue();
  });

  test("picks the booted sim first, else the newest-OS first", () => {
    expect(pickSimulator(parseSimulators(SIMCTL_SAMPLE))?.name).toBe("iPhone SE (3rd generation)");
    const cold = parseSimulators(SIMCTL_SAMPLE).map((sim) => ({ ...sim, booted: false }));
    expect(pickSimulator(cold)?.name).toBe("iPhone 17 Pro");
  });
});

const ADB_SAMPLE = `List of devices attached
emulator-5554	device
ABCD1234EFGH	device
some-serial	unauthorized`;

describe("adb parsing + devUrl resolution", () => {
  test("only authorized devices count", () => {
    expect(parseAdbDevices(ADB_SAMPLE)).toEqual([
      { emulator: true, serial: "emulator-5554" },
      { emulator: false, serial: "ABCD1234EFGH" },
    ]);
  });

  test("emulator → 10.0.2.2; physical → lan; none → undefined", () => {
    expect(androidDevUrl([{ emulator: true, serial: "emulator-5554" }], "192.168.1.5", 4199)).toBe(
      "http://10.0.2.2:4199",
    );
    expect(androidDevUrl([{ emulator: false, serial: "X" }], "192.168.1.5", 4199)).toBe(
      "http://192.168.1.5:4199",
    );
    expect(androidDevUrl([], "192.168.1.5", 4199)).toBeUndefined();
    expect(androidDevUrl([{ emulator: false, serial: "X" }], undefined, 4199)).toBeUndefined();
  });
});
