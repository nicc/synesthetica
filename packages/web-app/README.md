# Synesthetica Web App (Phase 0)

Minimal web application shell for the Phase 0 vertical slice.

## Purpose

This app provides:
- A working end-to-end demo: MIDI in → visuals out
- A test harness for ruleset and grammar iteration
- Proof that the contract-based architecture works

## What It Does

1. Requests Web MIDI access on page load
2. Displays available MIDI devices in a dropdown
3. Auto-starts a session when you select a device
4. Shows colored particles on canvas in response to MIDI note events

## Running Locally

### Prerequisites

- Node.js 18+ and npm
- A USB MIDI device (keyboard, controller, etc.)
- Chrome or Edge browser (for Web MIDI API support)

### Dev Server

```bash
# From project root
npm install
npm run build -ws  # Build dependencies first

# Start dev server (opens in Chrome - required for Web MIDI API)
cd packages/web-app
npm run dev:chrome
```

The app will open at `http://localhost:3000` in Chrome.

**Note:** Use `npm run dev:chrome` instead of `npm run dev` to ensure Chrome is used (Safari/Firefox don't support Web MIDI API).

### Production Build

```bash
npm run build
npm run preview
```

## How to Use

1. **Connect your MIDI device** to your computer via USB
2. **Open the app** in Chrome/Edge
3. **Grant MIDI permission** when prompted
4. **Select your device** from the dropdown
5. **Play notes** on your MIDI keyboard
6. **See colored particles** appear on the black canvas

### What You Should See

- Each note triggers a particle with a color based on pitch class
- Particles fade out over time
- Different pitches = different hues (deterministic mapping)

## Architecture

The app wires together the full Phase 0 pipeline:

```
WebMidiSource → MidiAdapter → Pipeline
                              ↓
                   PassthroughStabilizer
                              ↓
                      MinimalRuleset (CMS → Intents)
                              ↓
                      ParticleGrammar (Intents → Scene)
                              ↓
                    IdentityCompositor
                              ↓
                    Canvas2DRenderer → <canvas>
```

### Components Used

- **WebMidiSource**: Wraps Web MIDI API for testability
- **MidiAdapter**: Converts MIDI messages to CMSFrame events
- **PassthroughStabilizer**: No-op stabilizer (enrichment comes later)
- **MinimalRuleset**: Maps pitch → hue, velocity → brightness
- **ParticleGrammar**: Spawns particle entities on note_on
- **IdentityCompositor**: Simple pass-through (multi-part composition comes later)
- **Canvas2DRenderer**: Draws particles as filled circles

## Session Lifecycle

- **Session start**: Automatically when device is selected
- **Session running**: Render loop at ~60fps via `requestAnimationFrame`
- **Session stop**: Automatically on page unload
- **Reset**: Switching devices stops the old session and starts a new one

## Known Limitations (Phase 0)

- No audio input (MIDI only)
- Single part (no multi-instrument support)
- No real stabilizers (just pass-through)
- No LLM integration
- No presets or macro controls
- Minimal visual polish
- No note_off handling (particles fade on timer, not on release)

These are intentional - Phase 0 is about proving the architecture, not building the full feature set.

## Troubleshooting

### No MIDI devices found

- Check that your device is plugged in via USB
- Try unplugging and replugging the device
- Refresh the page
- Check browser console for errors

### MIDI access denied

- The browser requires HTTPS or localhost for MIDI access
- Grant permission when prompted
- Check browser settings (chrome://settings/content/midi)

### No particles appearing

- Check browser console for errors
- Verify the device is sending MIDI (test with another MIDI app)
- Try a different MIDI channel
- Check that you're using Chrome or Edge (Safari/Firefox don't support Web MIDI)

## Next Steps (Phase 1)

After Phase 0 is validated, we'll iterate on:
- Better rulesets (harmonic tension, phrase awareness)
- More expressive grammars (trails, fields, glyphs)
- Real stabilizers (chord detection, beat tracking)
- Multi-part support
- Preset system
- LLM integration for control

For now, this app serves as the foundation and test harness for that exploration.
