/**
 * Opens a URL in the user's default browser. Best-effort — if the
 * platform command fails, we log a message telling the user to open
 * it manually. The CLI does NOT fail if the browser can't be opened.
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";

export function openBrowser(url: string, log?: NodeJS.WritableStream): void {
  const stream = log ?? process.stderr;
  const [cmd, ...args] = openCommand(url);
  const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
  child.on("error", (err) => {
    stream.write(
      `could not open browser (${err.message}). Open manually: ${url}\n`,
    );
  });
  child.unref();
}

function openCommand(url: string): [string, ...string[]] {
  const p = platform();
  if (p === "darwin") return ["open", url];
  if (p === "win32") return ["cmd", "/c", "start", "", url];
  return ["xdg-open", url];
}
