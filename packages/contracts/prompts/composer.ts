/**
 * Shared system-overview composer.
 *
 * Composes the full LLM primer: authored narrative + generated
 * reference (macros / session controls / concepts / lenses / tools /
 * resources / session-time / presets).
 *
 * Kept here in contracts (not in the CLI) so the web-app's About
 * panel can render the exact same text the LLM receives via
 * `get_started`. Takes the authored markdown as input so callers
 * choose how to load it (fs on the CLI side; Vite's `?raw` in the
 * web-app). Every other input comes from the annotation manifest
 * which both packages already import.
 *
 * Pure: same input, same output.
 */

import { productionManifest } from "../annotations/manifest.js";
import type {
  MacroAnnotation,
  SessionControlAnnotation,
  DerivedStateAnnotation,
  SystemConceptAnnotation,
  LensAnnotation,
  PresetAnnotation,
  ToolAnnotation,
  ResourceAnnotation,
} from "../annotations/annotations.js";

/**
 * Compose the LLM primer given the authored system-overview markdown.
 * Callers load the .md themselves and pass the string in.
 */
export function composeSystemOverview(sourceMd: string): string {
  const sections: string[] = [
    sourceMd.trimEnd(),
    "",
    "---",
    "",
    "# Full reference (auto-generated from the annotation manifest)",
    "",
    "Same content as the per-URI `annotations://` resources (user-attach only in Claude Desktop). Ordered so foundational vocabulary comes first, tool + macro details later.",
    "",
    ...(productionManifest.derivedState.length > 0
      ? [
          "## Derived session state",
          "",
          "Read-only fields; server-computed. Prefer these over inferring from primary fields.",
          "",
          productionManifest.derivedState.map(renderDerivedState).join("\n\n"),
          "",
        ]
      : []),
    "## System concepts",
    "",
    productionManifest.concepts.map(renderConcept).join("\n\n"),
    "",
    "## Lenses",
    "",
    productionManifest.lenses.map(renderLens).join("\n\n"),
    "",
    "## Session time",
    "",
    renderSessionTimeGuidance(),
    "",
    "## Presets",
    "",
    renderPresets(productionManifest.presets ?? []),
    "",
    "## Session controls",
    "",
    productionManifest.sessionControls.map(renderSessionControl).join("\n\n"),
    "",
    "## Tools",
    "",
    "### Result shape (every tool)",
    "",
    renderToolResultShape(),
    "",
    (productionManifest.tools ?? []).map(renderTool).join("\n\n"),
    "",
    "## Macros",
    "",
    productionManifest.macros.map(renderMacro).join("\n\n"),
    "",
    "## Resources",
    "",
    "User-attach only in Claude Desktop; the reader tools above return the same content. Per-item annotation resources (`annotations://macros/{id}` etc.) aren't repeated here.",
    "",
    (productionManifest.resources ?? []).map(renderResource).join("\n\n"),
    "",
  ];
  return sections.join("\n");
}

// ----------------------------------------------------------------------
// Section renderers — all pure functions of the annotation manifest.
// ----------------------------------------------------------------------

function renderSessionTimeGuidance(): string {
  return [
    "All timestamps in state are **milliseconds since session start**. Wall-clock is on `startedAt` (ISO 8601 string). `now` is session-ms, computed fresh on every read (two consecutive `get_state` reads show `now` advancing). Both fields appear on `get_state` and on the `get_recent_events` envelope. Both are null until `state.session.phase` is `input-active`; check phase before temporal math when the pipeline may not yet have an adapter.",
    "",
    "**Each event is bitemporal.** `event.t` is the **event clock** — the raw MIDI/audio timestamp of the musical event itself (note-on's onset, note-off's release, chord's onset). `event.frameT` is the **observation clock** — the animation-frame boundary at which the buffer captured it. The two usually differ by a few ms because frames capture at ~60Hz (~17ms) while events arrive between frames.",
    "- **`t` — musical arithmetic.** Drift (`event.t mod subdivMs`), inter-onset intervals (`b.t - a.t`), duration (`noteOff.t - noteOn.t`). Higher precision, matches what the player did.",
    "- **`frameT` — observation questions.** \"N seconds ago\" (`now - event.frameT`), aligning events to state-changed pushes (also frame-boundary).",
    "- The two match on `note-off` only in a pathological fallback (buffer lost the release timestamp) — usually no need to notice.",
    "",
    "**Ordering.** `id` is strictly monotonic (`get_recent_events(since: N)` never returns an id ≤ N). Within a single frame batch, `t` and `id` agree. Across batches, `frameT` is monotonic but `t` is not guaranteed to be for audio-derived events — Basic Pitch reports onsets from a rolling model buffer so an audio note-on can carry a `t` older than the previous batch's `frameT`. MIDI is real-time and doesn't have this. Sort by `t` if strict musical order matters across batches on an audio session.",
    "",
    "**How to answer temporal questions.**",
    "- \"What time did I play that?\" — `new Date(startedAt) + event.t` (wall-clock).",
    "- \"How long has the session been going?\" — `now`.",
    "",
    "Response latency doesn't complicate this: `now` is fresh at every read, so relative comparisons stay anchored regardless of think-time.",
  ].join("\n");
}

function renderToolResultShape(): string {
  return [
    "Every tool returns one of:",
    "- Success: `{ ok: true, state: <StateSnapshot> }` — the post-call state.",
    "- Failure: `{ ok: false, error: { code, message, details? } }` — code is a stable SCREAMING_SNAKE_CASE string.",
    "",
    "StateSnapshot's `macros` field is split into two views:",
    "- `intents`: last value asked for per macro (by `set_macro`, `set_hue_for_pitch`, `switch_preset`, or a panel widget edit). Includes compound macros keyed by their compound id.",
    "- `effective`: sourced from consumer runtime — what lenses/stabilizers/vocab are actually running with. Compound macros don't appear here; their leaves do.",
    "- The two can legitimately disagree (a compound set then a leaf overridden; a preset apply + tweak). Treat divergence as information, not a bug.",
    "- **Reporting to the user**: when you just set a value and they match, state it plainly ('linger's at 6 now'). When they differ AND the user just asked, name both ('you asked for 8 but the pipeline's showing 6'). Silent divergence — stay quiet unless the delta is large or contradicts a recent instruction.",
    "",
    "Common codes (match on `code`, not on message text):",
    "- `SCHEMA_INVALID` — argument shape / type wrong or required arg missing.",
    "- `MACRO_UNKNOWN` — `set_macro` called with an unknown macro id. `details.available` lists valid ids for retry.",
    "- `MACRO_VALUE_OUT_OF_RANGE` — continuous / compound value outside declared range (message includes the range).",
    "- `MACRO_VALUE_WRONG_TYPE` — value shape wrong for the macro's type (e.g. string for continuous).",
    "- `PRESET_NOT_FOUND` — `switch_preset` called with an unknown name. `details.available` lists preset names for retry.",
    "- `KEY_INVALID_PAIR` — `set_key`: root and mode must be both null or both set.",
    "- `TEMPO_OUT_OF_RANGE` — `set_tempo`: bpm outside [30, 240] (and not null).",
    "- `METER_INVALID_PAIR` — `set_meter`: bpb and beat_value must be both null or both set.",
    "- `METER_VALUE_UNSUPPORTED` — `set_meter`: beat_value not in {1, 2, 4, 8, 16}.",
    "- `CHORD_MODE_UNKNOWN` — `set_chord_mode`: mode not in {harmonic, bass-led}.",
    "- `INSTANCE_NOT_FOUND` — the `instance` arg doesn't match any running engine.",
    "- `ENGINE_ERROR` — underlying engine / transport / filesystem failure. Read the message.",
    "- `ENGINE_NOT_STARTED` — the pipeline isn't running. Call `start_session` and then re-issue the original call.",
    "- `PRIMER_INVALID` — the `primer` argument was missing or stale. Every tool except `get_started` requires the token returned by `get_started` as its `primer` argument. `details.primer` + `details.token` carry the fresh values — read the primer and retry with the new token in one round-trip (no need to call `get_started` again manually).",
    "",
    "Handling guidance:",
    "- Use `details.available` (when present) to pick a valid retry value.",
    "- Fall back to reading the message only when no code applies.",
    "- Surface `SCHEMA_INVALID` errors as self-correct-and-retry (usually indicates a malformed call).",
    "- Full spec: SPEC 015 (specs/SPEC_015_control_op_validation_errors.md).",
  ].join("\n");
}

function renderResource(r: ResourceAnnotation): string {
  const lines: string[] = [];
  lines.push(`### \`${r.uri}\` — ${r.name}`);
  lines.push(r.description);
  lines.push(`Subscribable: ${r.subscribable}`);
  if (r.aliases?.length) lines.push(`Aliases: ${r.aliases.join(", ")}`);
  if (r.notes?.length) {
    lines.push("Notes:");
    for (const n of r.notes) lines.push(`- ${n}`);
  }
  if (r.examples?.length) {
    lines.push("Examples:");
    for (const e of r.examples) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}

function renderTool(t: ToolAnnotation): string {
  const lines: string[] = [];
  lines.push(`### \`${t.id}\``);
  lines.push(t.description);
  if (t.aliases?.length) lines.push(`Aliases: ${t.aliases.join(", ")}`);
  if (t.notes?.length) {
    lines.push("Notes:");
    for (const n of t.notes) lines.push(`- ${n}`);
  }
  if (t.examples?.length) {
    lines.push("Examples:");
    for (const e of t.examples) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}

function renderPresets(presets: readonly PresetAnnotation[]): string {
  const lines: string[] = [];
  lines.push(
    "Named snapshots of macros + prescribed context (key / tempo / meter / chord mode / metronome). **Input source is NOT captured** — loading a preset never changes what the pipeline is listening to (so a preset saved on a MIDI keyboard is loadable on a mic-only setup). User-managed at runtime; per-user disk storage. See `list_presets` / `get_preset` / `switch_preset` / `save_preset` / `delete_preset` under Tools for the operations.",
  );
  if (presets.length === 0) {
    lines.push("");
    lines.push(
      "No default presets ship with this build. Any preset the user sees is one they (or a previous session) saved.",
    );
    return lines.join("\n");
  }
  lines.push("");
  lines.push("Shipped default presets:");
  lines.push("");
  for (const p of presets) {
    lines.push(`### \`${p.id}\` — ${p.name ?? p.id}`);
    if (p.notes?.length) for (const n of p.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderMacro(m: MacroAnnotation): string {
  const lines: string[] = [];
  lines.push(`### \`${m.id}\` — ${m.name ?? m.id}`);
  if (m.aliases?.length) lines.push(`Aliases: ${m.aliases.join(", ")}`);
  if (m.affects?.length) lines.push(`Affects: ${m.affects.join(", ")}`);

  switch (m.type) {
    case "continuous":
      lines.push(
        `Type: continuous, range [${m.range[0]}, ${m.range[1]}], default ${m.default}`,
      );
      lines.push(`Low: ${m.directionality.low.description}`);
      if (m.directionality.low.tendsTo?.length) {
        lines.push(`  tends to: ${m.directionality.low.tendsTo.join("; ")}`);
      }
      lines.push(`High: ${m.directionality.high.description}`);
      if (m.directionality.high.tendsTo?.length) {
        lines.push(`  tends to: ${m.directionality.high.tendsTo.join("; ")}`);
      }
      break;
    case "discrete":
      lines.push(
        `Type: discrete, default ${JSON.stringify(m.default)}`,
      );
      lines.push(
        `Values: ${m.enumValues.map((v) => `${JSON.stringify(v.value)} (${v.label})`).join(", ")}`,
      );
      break;
    case "compound": {
      lines.push(
        `Type: compound, range [${m.range[0]}, ${m.range[1]}], default ${m.default}`,
      );
      const targetLabels = m.targets.map((t) => {
        if (typeof t === "string") return t;
        return t.invert ? `${t.id} (inverted)` : t.id;
      });
      lines.push(
        targetLabels.length > 0
          ? `Fans out to: ${targetLabels.join(", ")}`
          : `Fans out to: (none wired yet — no-op until targets are exposed as macros)`,
      );
      lines.push(`Low: ${m.directionality.low.description}`);
      lines.push(`High: ${m.directionality.high.description}`);
      break;
    }
  }

  if (m.notes?.length) {
    lines.push("Notes:");
    for (const n of m.notes) lines.push(`- ${n}`);
  }
  if (m.cautions?.length) {
    lines.push("Cautions:");
    for (const c of m.cautions) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}

function renderSessionControl(s: SessionControlAnnotation): string {
  const lines: string[] = [];
  lines.push(`### \`${s.id}\` — ${s.name ?? s.id}`);
  if (s.aliases?.length) lines.push(`Aliases: ${s.aliases.join(", ")}`);
  lines.push(`Nullable: ${s.nullable}`);

  switch (s.type) {
    case "number":
      lines.push(
        `Type: number, range [${s.range[0]}, ${s.range[1]}]${s.unit ? ` ${s.unit}` : ""}`,
      );
      break;
    case "enum": {
      const opts = s.dynamicOptions
        ? "(dynamic — runtime-populated)"
        : s.enumValues.map((v) => `${JSON.stringify(v.value)} (${v.label})`).join(", ");
      const dflt = s.default !== undefined ? `, default ${JSON.stringify(s.default)}` : "";
      lines.push(`Type: enum${dflt}`);
      lines.push(`Values: ${opts}`);
      break;
    }
    case "boolean":
      lines.push(`Type: boolean`);
      break;
    case "pair":
      lines.push(`Type: pair — set both together (${s.pair[0]} + ${s.pair[1]})`);
      break;
  }

  if (s.notes?.length) {
    lines.push("Notes:");
    for (const n of s.notes) lines.push(`- ${n}`);
  }
  if (s.cautions?.length) {
    lines.push("Cautions:");
    for (const c of s.cautions) lines.push(`- ${c}`);
  }
  return lines.join("\n");
}

function renderDerivedState(d: DerivedStateAnnotation): string {
  const lines: string[] = [`### \`${d.id}\``];
  if (d.name) lines.push(`Name: ${d.name}`);
  lines.push(`Derived from: ${d.derivedFrom.join(", ")}`);
  if (d.values?.length) {
    lines.push(`Values: ${d.values.map((v) => JSON.stringify(v)).join(" | ")}`);
  }
  if (d.aliases?.length) lines.push(`Aliases: ${d.aliases.join(", ")}`);
  if (d.notes?.length) {
    lines.push("Notes:");
    for (const n of d.notes) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}

function renderConcept(c: SystemConceptAnnotation): string {
  const lines: string[] = [`### ${c.term}`, c.definition];
  if (c.related?.length) lines.push(`Related: ${c.related.join(", ")}`);
  if (c.examples?.length) {
    lines.push("Examples:");
    for (const e of c.examples) lines.push(`- ${e}`);
  }
  return lines.join("\n");
}

function renderLens(g: LensAnnotation): string {
  const lines: string[] = [`### \`${g.id}\` — ${g.name ?? g.id}`];
  if (g.aliases?.length) lines.push(`Aliases: ${g.aliases.join(", ")}`);
  if (g.illustrates?.length) lines.push(`Illustrates: ${g.illustrates.join(", ")}`);
  if (g.traits?.length) lines.push(`Traits: ${g.traits.join(", ")}`);
  if (g.notes?.length) {
    lines.push("Notes:");
    for (const n of g.notes) lines.push(`- ${n}`);
  }
  if (g.cautions?.length) {
    lines.push("Cautions:");
    for (const c of g.cautions) lines.push(`- ${c}`);
  }
  if (g.macroResponses && Object.keys(g.macroResponses).length > 0) {
    lines.push("Macro responses:");
    for (const [macroId, resp] of Object.entries(g.macroResponses)) {
      const suffix = resp.notes ? ` — ${resp.notes}` : "";
      lines.push(`- \`${macroId}\`: ${resp.responsiveness}${suffix}`);
    }
  }
  return lines.join("\n");
}
