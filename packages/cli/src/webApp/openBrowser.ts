/**
 * Opens a URL in the user's browser. Best-effort — if the platform
 * command fails, we log a message telling the user to open it
 * manually. The CLI does NOT fail if the browser can't be opened.
 *
 * `browser` selects the target: 'default' uses the OS default,
 * 'chrome' explicitly picks Chrome (which currently has the most
 * reliable Web MIDI support — Firefox's implementation misses some
 * devices; Safari lacks Web MIDI entirely).
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";

export type BrowserTarget = "default" | "chrome";

export function openBrowser(
  url: string,
  target: BrowserTarget = "default",
  log?: NodeJS.WritableStream,
): void {
  const stream = log ?? process.stderr;
  const [cmd, ...args] = openCommand(url, target);
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.on("error", (err) => {
    stream.write(
      `could not open ${target} browser (${err.message}). Open manually: ${url}\n`,
    );
  });
  child.unref();
}

function openCommand(url: string, target: BrowserTarget): [string, ...string[]] {
  const p = platform();
  if (target === "chrome") {
    if (p === "darwin") return ["open", "-a", "Google Chrome", url];
    if (p === "win32") return ["cmd", "/c", "start", "", "chrome", url];
    // Linux — try google-chrome first, fall back to chromium via the
    // shell so the second option runs when the first isn't installed.
    return [
      "sh",
      "-c",
      `google-chrome ${JSON.stringify(url)} || google-chrome-stable ${JSON.stringify(url)} || chromium ${JSON.stringify(url)} || chromium-browser ${JSON.stringify(url)}`,
    ];
  }
  if (p === "darwin") return ["open", url];
  if (p === "win32") return ["cmd", "/c", "start", "", url];
  return ["xdg-open", url];
}
