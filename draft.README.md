# Synesthetica — README outline (working draft, structure only)

*Not the actual README — a scaffold to collaborate on structure before Nic writes the prose. Every bullet is a candidate section / paragraph, not a heading tree.*

---

## Opening hook (top of page, first 5 seconds)

- One sentence: what Synesthetica is + who it's for.
- **Hero visual** — SHIP milestone: a strong static screenshot of a live session with the three columns lit up. ITERATION 2: replace with a short GIF or embedded video once we've captured recordings. Design the surrounding layout so the swap is drop-in.
- Two links right under the hero:
  - **Try it in your browser** → hosted-web-only URL (after esco deploys). Bring MIDI or mic; no install.
  - **Install with Claude Desktop / Claude Code** → jumps to Install section.
- Optional: one-line status ("v1.0 · Claude Desktop supported · Chrome/Firefox").

## What it is

- Three or four sentences on the core loop: user plays → engine visualises → user asks LLM to adjust how it reads.
- **Deliberately not** an audio effect / not a DAW plugin / not a music-generation tool.
- Position clearly against adjacent things people will assume it is.

## What it looks like

- Screenshots of the three columns (dynamics / rhythm / harmony) with a one-sentence caption each — same content the About panel opens with, just visually.
- ITERATION 2: short GIF alongside the screenshots showing a live LLM interaction changing the visualisation. Screenshots stay as the primary orientation aid; the GIF supplements.

## Quick start — hosted (fastest evaluation)

- One-line pitch: "click, allow mic or plug in MIDI, play."
- Link + very short walk-through (3 bullet points max).
- Note what the hosted version lacks (LLM control, preset save) and why the desktop path exists.

## Quick start — with Claude Desktop

- Prereqs: Node ≥ X, Chrome or Firefox (Safari for mic only), Claude Desktop installed.
- `npm install -g @synesthetica/cli` (or whatever the C1 decision lands on).
- Claude Desktop config snippet — one code block, verbatim.
- Restart Claude Desktop.
- "Ask Claude to visualise your playing" → what to type; what to expect.

## Quick start — with Claude Code

- Terser variant of the above; whatever the `/mcp` install path ends up being.

## Bring your own input

- MIDI keyboard: plug in first, then start.
- Microphone: any built-in / USB mic; Basic Pitch runs in-browser.
- Panel Basics tab is where the user picks between them (or the LLM does via `set_input`).

## Using it (first session flow)

- "Start me a session, I'll play piano" — what the LLM does, what happens on screen.
- "Set tempo to 90, key to F minor, 3/4" — three ops, one sentence per.
- "How's my timing?" — the interpretive-posture use case.
- "Save this as `practice`" — presets in one line.
- End: "Thanks, that's enough" — the LLM tears down.

## The panel (secondary control surface)

- Basics / Advanced / About tabs, one-line each.
- Everything the LLM can do, the user can do too (and vice versa).
- About tab is the in-app user primer — points at it for depth without repeating.

## Design intent

- The section already exists in the current README — likely keep, tighten, cross-link.
- CLI + MCP server + browser-tab visualiser (not a native app; see v2 tracker if curious).
- Route 1: MCP-only startup; pipeline behind explicit `start_session`; zero-cost when not in a session.
- Deterministic engine + LLM interpretation: the analyser refuses to guess key/tempo/meter, the LLM interprets everything else.
- Primer token: LLM must read the primer before any tool call; stale-invalidation for free.

## Roadmap / what's next (v1.1 and beyond)

- On-screen MIDI keyboard (r8ck).
- Metronome unlock via tool (1kze).
- Getting-started modal for the hosted version (iqwv).
- Multi-instance routing.
- Electron / native app shell (v2).
- Link to beads tracker for the full backlog.

## Development

- Monorepo layout (contracts / engine / adapters / cli / web-app).
- One-line each: `npm test -ws` runs all, `npm run build -ws` builds, `npm run lint` lints.
- Lens development pointer → `packages/engine/src/lenses/README.md`.
- SPEC docs pointer → `specs/`.

## Contributing

- Where to file issues (beads or GitHub — decide during C1).
- Code style + test conventions (short).
- Link to CLAUDE.md if we're OK making it public — it's the working-agreement doc for AI collaborators, might interest human ones too.

## Acknowledgements / built with

- Basic Pitch (Spotify) — polyphonic pitch detection.
- Tonal.js — chord + key theory.
- Three.js — rendering.
- MCP — control protocol.

## License

- Whatever C1 decides.

---

## Notes for Nic (things worth deciding as we go)

- **How much of the design-intent section to keep in README vs move to a separate DESIGN.md?** The current README already carries a chunk; if the design section grows it may deserve its own file.
- **Screenshot / GIF sourcing** — SHIP milestone uses static screenshots only. You'll capture those on the bigger keyboard alongside the op-coverage sweep. Decide capture resolution + whether we want a version with the LLM chat pane visible alongside the visualiser (probably yes for the hero, no for the per-lens screenshots). ITERATION 2 captures GIFs / video after you've had a chance to rehearse the demo path against a shipped README.
- **npm scoping** — `@synesthetica/cli` vs a bare `synesthetica` package name is a C1 decision that changes the install snippet here.
- **Hosted URL** — waits on esco deploy. Placeholder text acceptable in draft; verify before merge.
- **"Try it" ordering** — hosted-first vs Claude-Desktop-first is a UX call. Hosted-first lowers evaluation friction; Claude-Desktop-first anchors on the intended primary use case. Currently drafted hosted-first.
- **CLAUDE.md publicity** — if we mention it in Contributing, need to be OK with people reading how the AI collaborator operates. No secrets in it, but it's a stance.
- **Wordcount target** — my instinct is "short enough that the hero visual + first two sections do 80% of the work; everything below is for people who've decided to install." Push back if you want more depth up top.
