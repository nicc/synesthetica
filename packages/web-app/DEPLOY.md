# Deploying the hosted web-only version

The web-app runs standalone from any static file host. No CLI, no
WebSocket bridge, no LLM — the visualiser + panel work locally in the
browser, driven directly by the user (MIDI keyboard or microphone).

For LLM-controlled operation, see the CLI (`synesthetica start`); that
path spins up the same web-app but injects a `ws-port` query parameter
that wires up the WebSocket bridge. Standalone hosted mode omits that
parameter and the app skips the bridge cleanly.

## Build

```sh
npm --workspace @synesthetica/web-app run build
```

Produces `packages/web-app/dist/`. Contents:

```
dist/
├── index.html
├── assets/
│   ├── index-<hash>.js               # main bundle
│   └── inference-worker-entry-<hash>.js  # Basic Pitch worker
├── audio-capture-worklet.js          # AudioWorklet processor
├── models/                           # Basic Pitch weights
├── _headers                          # Netlify / Cloudflare Pages
└── .htaccess                         # Apache
```

Total: ~6 MB (audio + model weights dominate). Upload the whole
`dist/` tree to the host root; no server-side runtime required.

## Cross-origin isolation (required for audio input)

The audio path (Basic Pitch onset detection) uses `SharedArrayBuffer`
between the AudioWorklet and the inference worker. Browsers only
allow `SharedArrayBuffer` on cross-origin-isolated pages, which
requires two response headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without them, the page loads and MIDI input works, but selecting the
microphone as input silently fails (SAB constructor throws).

The bundled `_headers` and `.htaccess` set these for Netlify /
Cloudflare Pages and Apache. For nginx, add to the server block:

```nginx
location / {
    add_header Cross-Origin-Opener-Policy "same-origin";
    add_header Cross-Origin-Embedder-Policy "require-corp";
}
```

## Hetzner (nginx via FTP)

1. Build: `npm --workspace @synesthetica/web-app run build`
2. Upload the contents of `packages/web-app/dist/` to the target
   directory on the server (e.g. `/var/www/example.com/synesthetica/`).
3. Add the nginx header block above to the site's server config.
4. Reload nginx: `sudo systemctl reload nginx`.
5. Visit the URL. If MIDI hardware is plugged in, allow it when
   prompted. Panel → Basics → Input to pick a source.

## Verifying cross-origin isolation

Open DevTools → Console on the deployed page and run:

```js
crossOriginIsolated
```

`true` means the headers are set correctly and audio input will work.
`false` means MIDI still works but audio silently fails.

## What the hosted version doesn't have

- **LLM control** — no MCP server, no WebSocket bridge. Every macro,
  session control, and preset op happens through the panel.
- **Preset save/switch** — the CLI hosts the preset store; the hosted
  version has no persistence layer. Panel state resets on reload.
- **On-screen keyboard** — coming in v1.1 as another input option
  (`synesthetica-r8ck`). Until then, bring a MIDI device or use the
  microphone.
