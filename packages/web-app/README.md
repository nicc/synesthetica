# Synesthetica Web App

Web application shell for the Synesthetica pipeline.

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

- Notes trigger visual markers and particles with colors based on pitch class
- Beat pulses appear on downbeats (when beat detection is active)
- Chords produce expanding glows with history trails
- Different pitches = different hues (deterministic mapping per SPEC 002)

## Architecture

The app wires together the full pipeline (RFC 005 / RFC 006):

```
WebMidiSource → RawMidiAdapter → VisualPipeline
                                      ↓
                         NoteTrackingStabilizer (RawInputFrame → MusicalFrame)
                         ChordDetectionStabilizer (MusicalFrame → MusicalFrame + chords)
                                      ↓
                         MusicalVisualRuleset (MusicalFrame → AnnotatedMusicalFrame)
                                      ↓
                         TestRhythmGrammar + TestChordProgressionGrammar
                         (AnnotatedMusicalFrame → SceneFrame)
                                      ↓
                              IdentityCompositor
                                      ↓
                              Canvas2DRenderer → <canvas>
```

### Components Used

- **WebMidiSource**: Wraps Web MIDI API for testability
- **RawMidiAdapter**: Converts MIDI messages to RawInputFrame
- **NoteTrackingStabilizer**: Tracks note lifecycle (attack → sustain → release)
- **ChordDetectionStabilizer**: Detects chords from active notes
- **MusicalVisualRuleset**: Annotates musical elements with visual properties (palette, texture, motion)
- **TestRhythmGrammar**: Renders beats and notes as timing markers (ignores chords)
- **TestChordProgressionGrammar**: Renders chords as glows with history trail (ignores beats)
- **IdentityCompositor**: Simple pass-through (multi-part composition comes later)
- **Canvas2DRenderer**: Draws entities as shapes on canvas

## Session Lifecycle

- **Session start**: Automatically when device is selected
- **Session running**: Render loop at ~60fps via `requestAnimationFrame`
- **Session stop**: Automatically on page unload
- **Reset**: Switching devices stops the old session and starts a new one

## Known Limitations

- No audio input (MIDI only)
- Single part (no multi-instrument support)
- No beat detection stabilizer yet (beat annotation always null)
- No LLM integration
- No presets or macro controls
- Minimal visual polish

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

## Next Steps

- Beat detection stabilizer
- Better rulesets (harmonic tension, phrase awareness, richer palette system)
- More expressive grammars (trails, fields, glyphs)
- Enhanced stabilizers (phrase detection, progression tracking)
- Multi-part support
- Preset system
- LLM integration for control
