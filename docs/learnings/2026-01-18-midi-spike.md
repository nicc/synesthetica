# MIDI-to-Canvas Spike: What We Learned

Date: 2026-01-18
Issue: synesthetica-w9j

## Purpose

Validate core architectural assumptions about Web MIDI and browser rendering before committing to pipeline design.

## Test Environment

- Browser: Chrome (assumed from Web MIDI support)
- MIDI device: User's controller (name displayed correctly)
- Rendering: Canvas2D with requestAnimationFrame

## Results

### 1. MIDI Event Latency

**Measured:** ~0.4ms average, 1-3ms range

**Interpretation:** The Web MIDI API delivers events with negligible latency. The `event.timeStamp` provides meaningful, sub-millisecond precision. This is far better than needed for visual feedback.

**Spec implication:** None. Our timing model doesn't need to account for MIDI API latency as a concern.

### 2. Frame Timing

**Measured:** ~16.7ms frame time (stable)

**Interpretation:** This is exactly 60fps, as expected from requestAnimationFrame. The frame loop is stable with no jank observed.

**Spec implication:** SPEC_005's pull-based timing model is validated. The renderer can request frames at display refresh rate without issues.

### 3. Permission Flow

**Observed:** Browser prompted for MIDI access permission. User approved. Device connected immediately after, name displayed correctly.

**Interpretation:** Standard browser permission flow. One-time prompt per origin, no friction after approval.

**Spec implication:** None. The adapter contract doesn't need to specify permission-handling ceremonies — this is browser-standard behavior.

### 4. Event Delivery Under Load

**Observed:** No dropped events even under fast playing.

**Interpretation:** The Web MIDI API is robust. Events arrive reliably and in order.

**Spec implication:** The adapter can pass events through without buffering or coalescing concerns.

### 5. Push vs Pull Model Reconciliation

**Key insight:** Web MIDI is push-based (events arrive asynchronously), but our architecture assumes pull-based frame generation. The spike demonstrates that this is a **non-issue** because:

1. MIDI events update state (the `activeNotes` Map)
2. The render loop reads that state on each frame
3. The two are decoupled by the state buffer

This is exactly the pattern the specs describe: adapter writes to CMS, renderer pulls frames. The "push" events become state mutations, and the "pull" reads current state.

**Spec implication:** This pattern should be explicit in SPEC_008 (Pipeline Orchestration) — the adapter's job is to maintain current state, not to push frames.

## Assumptions Validated

- [x] requestAnimationFrame provides smooth, consistent frame timing
- [x] Web MIDI latency is negligible (<3ms worst case)
- [x] Browser permission flow is standard and non-blocking after approval
- [x] Event delivery is reliable under fast input
- [x] Push-to-pull reconciliation works via state buffering

## Assumptions Invalidated

None.

## Surprises

None significant. The browser APIs behave as documented.

## Unknowns Remaining

1. **Multi-device behavior**: What happens with multiple MIDI devices? (Not tested)
2. **Device hot-plug**: Does `onstatechange` fire reliably? (Not tested under real unplug/replug)
3. **Audio adapter latency**: This spike tested MIDI only. Audio (Web Audio API / Meyda.js) may have different characteristics.
4. **Long session stability**: Only tested for a few minutes. Memory leaks or drift over hours not tested.

## Spec Amendments Needed

1. **SPEC_008 (Pipeline Orchestration)**: Add explicit note that adapters are state-writers, not frame-pushers. The push-to-pull reconciliation happens at the state boundary.

## Recommendation

Proceed with Phase 0 implementation. The browser APIs support our architectural assumptions. No design changes needed.

## Code Disposition

The spike code in `spike/w9j-midi-canvas.html` should be deleted after this document is committed, per the spike's exit criteria. It has served its purpose.
