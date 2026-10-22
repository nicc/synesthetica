/**
 * Loopback-only networking for the CLI's local servers.
 *
 * The static web-app server and the engine bridge exist to talk to a
 * browser tab on the same machine. Binding to the loopback interface
 * keeps them off the LAN. The bridge additionally checks the browser
 * Origin header, because any web page the user has open can open a
 * WebSocket to localhost (WebSockets are not CORS-gated).
 *
 * The browser-facing URL stays `http://localhost:<port>` — per-origin
 * permission grants (Web MIDI, microphone) are keyed on that origin.
 */

/** Interface the local servers bind to. */
export const LOOPBACK_HOST = "127.0.0.1";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * True when a WebSocket upgrade's Origin header is absent (non-browser
 * client on this machine) or names a loopback host. Any other origin
 * is a page from elsewhere and is rejected.
 */
export function isLoopbackOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true;
  try {
    return LOOPBACK_HOSTNAMES.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}
