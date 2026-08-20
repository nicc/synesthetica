/**
 * Static-file HTTP server for the bundled web-app.
 *
 * Used by installed copies of the CLI where Vite isn't available —
 * the web-app is pre-built and shipped inside the CLI package. This
 * server serves that dist directory over HTTP.
 *
 * Requires the same COOP/COEP headers Vite sets in dev, so
 * SharedArrayBuffer (needed by the polyphonic audio adapter per
 * SPEC 012) works.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, statSync, createReadStream } from "node:fs";
import { extname, join, normalize, sep } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export interface ServeStaticOptions {
  /** Directory to serve. Must exist and contain index.html. */
  root: string;
  /** Bind port. 0 = OS-assigned. */
  port: number;
  /** Optional log sink for one-line request events; silent otherwise. */
  log?: (line: string) => void;
}

export interface ServeStaticHandle {
  port: number;
  url: string;
  close(): Promise<void>;
}

export async function serveStatic(opts: ServeStaticOptions): Promise<ServeStaticHandle> {
  if (!existsSync(opts.root)) {
    throw new Error(`serveStatic: root does not exist: ${opts.root}`);
  }
  if (!existsSync(join(opts.root, "index.html"))) {
    throw new Error(`serveStatic: no index.html under ${opts.root}`);
  }
  const log = opts.log ?? (() => {});

  const server = createServer((req, res) => handleRequest(req, res, opts.root, log));
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", (err) => reject(err));
    server.listen(opts.port);
  });
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : opts.port;
  return {
    port,
    url: `http://localhost:${port}/`,
    async close() {
      // closeAllConnections lets close() resolve immediately instead
      // of waiting on keep-alive sockets to time out. Node 18.2+.
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  log: (line: string) => void,
): void {
  // COOP/COEP so SharedArrayBuffer is available (SPEC 012 audio path).
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");

  const url = req.url ?? "/";
  // Strip query string; static serve ignores it.
  const pathOnly = url.split("?")[0];
  // Resolve requested path against root and guard against traversal.
  const requested = pathOnly === "/" ? "index.html" : decodeURIComponent(pathOnly.replace(/^\//, ""));
  const abs = normalize(join(root, requested));
  if (!abs.startsWith(root + sep) && abs !== root && !abs.startsWith(root + "/")) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }

  if (!existsSync(abs) || !statSync(abs).isFile()) {
    // SPA fallback: serve index.html so client-side routing works.
    // Only for GETs that don't look like asset requests.
    if (req.method === "GET" && !/\.\w+$/.test(pathOnly)) {
      streamFile(join(root, "index.html"), res, log);
      return;
    }
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  streamFile(abs, res, log);
}

function streamFile(
  path: string,
  res: ServerResponse,
  log: (line: string) => void,
): void {
  const ext = extname(path).toLowerCase();
  res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
  const stream = createReadStream(path);
  stream.on("error", (err) => {
    log(`serveStatic: stream error for ${path}: ${err.message}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("internal error");
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}
