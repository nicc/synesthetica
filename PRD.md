# Product Requirements Document

---
id: PRD.core-v1
status: draft
owner: user
last_updated: 2026-01-14
---

## Overview
High-level product requirements for Synesthetica.

This document translates the **VISION** into concrete user-facing requirements, without prescribing implementation details.

## Primary Use Case
- Synesthetic aid for ear training
- Mapping harmony played on a keyboard to visual representations that can be matched on guitar

## Secondary Use Case
- Real-time visual component for musical performance

## User Goals
- Quickly identify chord qualities and intervals by sight
- Develop intuitive recognition of harmonic relationships
- Bridge instruments (keyboard → guitar) via shared visual language

## Functional Requirements

### Input Processing
- Ingest MIDI note data (note on/off, velocity, channel)
- Ingest raw audio input (pitch detection, chord inference)
- Support multiple simultaneous input sources (e.g. keyboard + guitar)
- MIDI and audio produce equivalent internal representations with different confidence levels

### Visual Output
- Generate real-time visualisations that map musical structure to visual form
- Pitch-class determines hue (deterministic, learnable mapping)
- Velocity/loudness determines brightness
- Chord quality determines texture characteristics
- Rhythmic events (beats, onsets) drive motion and pulse
- Uncertainty in input (audio inference) produces visual instability (jitter, blur) without changing meaning

### Multi-Instrument Support (Parts)
- Each input stream is a "Part" with independent visual treatment
- Parts can be labelled by the user ("this is the guitar")
- Parts can have independent Presets assigned
- Parts can be spatially separated (left/right, overlay with transparency)

### Grammars and Presets
- **Grammars** are built-in visual grammars (e.g. "Stars", "Comets", "Rain")
- User selects and combines Grammars, adjusts macro controls
- **Presets** are saved configurations: selected grammars + macro values + layout
- Presets can be named and recalled ("practice mode", "matching fireworks")
- Macro controls adjust high-level characteristics:
  - **Articulation**: tight/discrete vs loose/blended
  - **Persistence**: ephemeral vs lingering
  - **Emphasis**: balance between melody, harmony, rhythm, timbre

### Interaction Model
- Two interaction surfaces:
  - Musical input through MIDI or audio
  - Speech control through an LLM

### Speech Control
- Primary control via natural language (speech or text), mediated by user-supplied LLM
-- Two interaction postures:
-  - **Conversational**: exploratory, tolerates ambiguity, system may suggest alternatives
-  - **Quiet**: performance-ready, short commands, no ambiguity tolerance, failures are silent no-ops
- User explores, adjusts and combines visual grammars, defines presets, loads presets:
  - musical/perceptual intent ("emphasise rhythm", "make it calmer")
  - selects and combines visual grammars ("what styles are available?", "let's try comet with a rain decay")
  - operational intent ("remember this, call it sparkles", "gimme sparkles")
- LLM interprets intent and operates system controls appropriately
- No requirement for users to know parameter names or internal structure

## Non-Functional Requirements
- **Latency**: Visual response within 50ms of input (imperceptible for ear training)
- **Reliability**: Graceful degradation under load; no crashes from malformed input
- **Responsiveness**: 60fps target for visual output; degrade to 30fps under heavy load

## Constraints

### Platform (v0)
- **Runtime**: Modern browser (Chrome/Edge recommended for Web MIDI support)
- **MIDI**: Web MIDI API for USB MIDI devices
- **Audio**: Web Audio API for microphone/audio interface input
- **Rendering**: WebGL (Canvas2D fallback acceptable for v0)

### Hardware Assumptions
- USB MIDI controller (keyboard, pad controller, etc.)
- Audio interface with browser-accessible input (appears as microphone)
- No DAW integration required; direct instrument input only

### Interface assumptions
- Docs are consumed by an LLM to acquire the skill of operating the system under user instruction
- Documentation is clear and comprehensive
- Visual grammars are individually annotated to convey the musical impact of macro controls

### Testing Support
- Audio file input (WAV/MP3) for reproducible testing
- MIDI file playback for deterministic fixture tests

### Future Platform Considerations (Not v0)
Native (Electron/Tauri) may be considered later if latency or system audio access becomes critical. The contract-based architecture supports this without core changes.

## Out of Scope (v0)
- DAW plugin (VST/AU)
- System audio capture (loopback)
- Mobile platforms
- Offline/installable PWA
- Automatic transcription or notation
- Music theory tutoring beyond visual feedback
- User-authored Grammars — users compose from provided Grammars only

## Success Metrics
- User can identify chord quality (major/minor/diminished) faster with visual aid than without
- Visual feedback feels intuitive rather than distracting after initial learning period
- System remains responsive during extended practice sessions (>30 minutes)
- Users can create and recall named configurations without technical knowledge
- Multi-instrument setups feel coherent, not chaotic

## User Journeys (v0)

### Ear Training Session
1. User opens Synesthetica in browser
2. Selects MIDI keyboard as input
3. Plays chords; sees immediate visual representation
4. Learns to associate visual patterns with chord qualities
5. Switches to guitar (audio input) and sees same visual language with more "shimmer" (uncertainty)

### Creating a Custom Look
1. User is in conversational mode, experimenting
2. Says "try making rhythm more prominent"
3. System adjusts; user evaluates
4. Says "keep that, call it 'practice mode'"
5. Configuration is saved; can be recalled by name later

### Performance Setup
1. User loads a saved Preset
2. Labels inputs: "this is keys", "this is guitar"
3. Positions: "keys on the left, guitar on the right"
4. Switches to quiet posture for performance
5. System responds only to short, unambiguous commands

