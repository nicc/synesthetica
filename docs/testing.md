# Testing

**Test runner:** vitest (fast, native ESM, minimal config)

**Principles:**
- Use dependency injection to decouple from browser APIs (Web MIDI, Web Audio, Canvas)
- Test transformation logic with mocks, not browser environments
- Keep tests fast — if it needs a browser, it's probably an integration test

**Rules.** A test protects a behaviour; it should survive a retune of a default and fail when the behaviour breaks.
1. **Import tunables; never retype them.** If a test needs `NOW_LINE_Y`, export it and assert the relationship (`NOW_LINE_Y - age / HISTORY_MS * NOW_LINE_Y`), not `0.85`. A retyped literal fails on every retune and checks nothing the constant doesn't already say.
2. **Assert properties over values.** Orderings, monotonicity, bounds and ratios (louder is higher; maj < dom7 < dim7 tension) encode the perceptual claim. Today's number does not.
3. **When a property needs a specific value, set it in the test.** Pass explicit config rather than relying on a default.
4. **Derive timing from config.** `t + cfg.hysteresisMs + 1`, not `t + 100`; a fixed offset only works while it exceeds the current default.
5. **Defaults are checked in one place.** `wiringCoverage.test.ts` checks every manifest default against its consumer. Don't pin defaults elsewhere.
6. **Every test must be able to fail.** No `expect(true)`, no `toBeDefined` as the only assertion, no counts that always-present entities (the now-line, labels) satisfy on their own.
7. **Mocked renderer tests assert observable state** — objects created, reused and removed; values derived from the entity. "Doesn't throw" is not a test.
8. **Goldens are for contract and protocol shapes**, compared on the fields that matter (not provenance or versions). A missing fixture directory is an error.
9. **SVG snapshots are review artefacts, not tests.** They live in `test/**/*.snapshot.ts`, run with `npm run snapshots`, and are not part of `npm test`. Prototypes are scripts, not test files.
10. **Socket tests wait on events, not sleeps.**
11. **No `console.log` in tests.** Write diagnostics to a snapshot or a script.

**Current patterns:**
- `MidiSource` interface allows testing `MidiAdapter` without Web MIDI API
- Tests live in `packages/<pkg>/test/` mirroring `src/` structure
- `npm test` at the root runs every package in one vitest process (`vitest.workspace.ts`); `npm test` inside a package runs just that package
- `AudioDetectionTracker.test.ts` is the model for timing tests: every timestamp is derived from the config under test

**What we don't have yet:**
- Golden tests for visual output (planned: synesthetica-901)
- Integration tests across pipeline components
- Browser-based end-to-end tests

**Lens development:** See [packages/engine/src/lenses/README.md](packages/engine/src/lenses/README.md) for the incremental development approach using ASCII diagrams, SVG snapshots, and simulation metrics.
