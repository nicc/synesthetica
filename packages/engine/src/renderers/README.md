# Renderers

A renderer consumes a `SceneFrame` (the pipeline's final stage) and draws it. The canonical renderer is WebGL via Three.js. Aesthetic experiments follow a "playful branches" pattern: each lives on its own branch off `main`, is switched on by a URL flag, and is never merged back.

## Canonical (on `main`)

| Renderer | When | URL flag | Notes |
|---|---|---|---|
| `ThreeJSRenderer` | default | _(none)_ | WebGL via Three.js. The reference implementation. Has unit tests. |

## Playful branches (experiments)

Each renderer below lives on its own branch off `main` and is enabled by a URL parameter at session start. They do not get merged back. The branch is the artefact.

| Renderer | Branch | URL flag | Register |
|---|---|---|---|
| `AsciiRenderer` | [`ascii`](https://github.com/nicc/synesthetica/tree/ascii) | `?renderer=ascii` | Unicode character grid in a `<pre>` element. DOM, not WebGL. |
| `GhibliRenderer` | [`ghibli-render`](https://github.com/nicc/synesthetica/tree/ghibli-render) | `?renderer=ghibli` | Painterly: warm sky gradient, selective bloom, drifting dust motes, film grain. Subclasses `ThreeJSRenderer`. |
| `IRobotRenderer` | [`i-robot`](https://github.com/nicc/synesthetica/tree/i-robot) | `?renderer=i-robot` | Atari arcade flat-shaded: ten-colour primary palette via colour quantisation, low-res framebuffer, pixelated upscale. Subclasses `ThreeJSRenderer`. |

To try one: `git checkout <branch>`, build the workspaces (`npm run build -ws`; the web app imports the engine's built output), then `cd packages/web-app && npm run dev` and load `localhost:3000/?renderer=<flag>`. The default URL still gives the canonical renderer.

## Extension points

WebGL-based experiments should subclass `ThreeJSRenderer` rather than copying it. The following members are deliberately `protected` for this purpose:

- `config` — world dimensions and other config
- `renderer` — the underlying `THREE.WebGLRenderer`
- `scene` — the Three.js scene (inject background quads, particle systems, post-processing here)
- `camera` — the perspective camera
- `hsvToThreeColor()` — colour mapping called by every entity render path; override to skin the whole image's palette in one place

`id` is `string` (not the literal `"threejs"`) so subclasses can declare their own identifier.

If an experiment needs access to something else, promote that member to `protected` on `ThreeJSRenderer` rather than copying the file. Keep the canonical renderer extensible.

Non-WebGL experiments (DOM, SVG, terminal, etc.) implement `IRenderer` directly — see `AsciiRenderer` as the worked example.

## See also

- [SPEC_009](../../../../specs/SPEC_009_pipeline_frame_types.md) — `SceneFrame` and `Entity` types that renderers consume
