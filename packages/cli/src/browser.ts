/** Shared chrome-headless-shell resolution — one install cache for the
 *  whole CLI (live sandbox + art rasterizer). Memoized per process. */
import path from "node:path";

let browserPath: string | undefined;

export const ensureBrowser = async (): Promise<string> => {
  if (browserPath) {
    return browserPath;
  }
  const { Browser, getInstalledBrowsers, install } = await import("@puppeteer/browsers");
  const cacheDir = path.resolve(process.cwd(), "node_modules/.frogoe-browser");
  const installed = await getInstalledBrowsers({ cacheDir });
  const existing = installed.find((b) => b.browser === Browser.CHROMEHEADLESSSHELL);
  browserPath =
    existing?.executablePath ??
    (
      await install({
        browser: Browser.CHROMEHEADLESSSHELL,
        buildId: "131.0.6778.204",
        cacheDir,
        unpack: true,
      })
    ).executablePath;
  return browserPath;
};
