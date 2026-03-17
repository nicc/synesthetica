# Principles

---
id: PRINCIPLES.core-v1
status: draft
owner: user
last_updated: 2026-01-21
---

## How to Use This Document
Principles are **constraints**, not aspirations.

If a design or implementation violates a principle, that violation must be:
- explicit
- intentional
- justified

## Core Principles

### 1. Functional First
Prefer functional programming models:
- immutability
- explicit data flow
- referential transparency where feasible

Stateful or imperative approaches must earn their place.

### 2. Simplicity Over Cleverness
- Choose the simplest thing that can work
- Avoid premature abstraction
- Optimise for understandability over novelty

### 3. Emergent Power from Primitives
Prefer a small number of well-designed primitives with wide, meaningful ranges.

- New capabilities should emerge from composition, interaction, and parameter extremes
- Avoid adding features that can be expressed by recombining existing primitives
- Treat edge cases as expressive territory, not accidents
- Design components as instruments, not utilities: expressive across range, sensitive to interaction, and rewarding mastery

A good system feels deeper over time without growing more complex.

### 4. Perceptual Honesty

**What we measure**
- Observations are accurate and consistent
- Measurements are relative to established musical structure (beat, subdivision, harmony)
- We report what happened, not what we think the player meant

**What we show**
- Mappings between sound, MIDI, and visuals reflect meaningful musical structure
- Representations are honest—not arbitrary or misleading
- We privilege learning and intuition over spectacle

**What we don't claim**
- Intent (why the player did something)
- Correctness (whether it was "right")
- Judgment (whether it was "good")

### 5. Real-Time Respect
The system must respect real-time interaction:
- predictable behaviour
- graceful degradation under load
- no hidden blocking or unbounded work in the hot path

### 6. Composability
Components should:
- be independently understandable
- compose via clear interfaces
- avoid tight coupling across domains (audio, MIDI, visuals)

### 7. Exploratory by Design
- Support experimentation and iteration
- Make parameters inspectable and adjustable
- Avoid locking in aesthetic or pedagogical assumptions too early

### 8. Experiential Feedback Through Simulation
When developing algorithms or behaviors that are difficult to describe or predict:
- Build diagnostic simulations that exercise the system with realistic input patterns
- Use verbose logging to expose internal state and decision points
- Analyze simulation output together before proposing implementation changes

This approach:
- Gives agents direct feedback loops without relying on human explanation of subjective experience
- Exposes edge cases and failure modes that verbal description would miss
- Creates a shared basis for reasoning about behavior

Example: Testing beat detection with simulated MIDI sequences (subdivisions, rubato, tempo changes) rather than trying to describe "what feels wrong" about the output.

Apply this principle whenever the system's behavior is experiential—where seeing it operate reveals more than describing it.

### 9. Observation Over Synthesis

**Show what happened; let perception find the pattern.**

When a musical property can be represented directly — each note's velocity as a position, each onset as a mark — prefer that over computed summaries like averages, trend lines, or smoothed curves. The human visual system is remarkably good at extracting pattern, range, consistency, and motion from raw observations. A system that computes these properties will always be an approximation of what the viewer would have perceived on their own, and risks asserting structure that isn't there.

This is a default, not an absolute. Computed analysis earns its place when:
- The pattern genuinely can't be perceived from direct observation (e.g. key centre detection from pitch class distributions over time)
- The time scale exceeds what visual memory can hold (e.g. long-range harmonic progression)
- The relationship is cross-domain and non-obvious (e.g. rhythmic stability derived from onset drift relative to a beat grid)

**Examples:**

The dynamics grammar shows each note onset as a positioned indicator that fades over time. The viewer perceives range (indicators span the bar), consistency (they cluster), crescendo (they drift upward), and rhythmic character (even spacing vs. bursts) — none of which the system computes or asserts.

A side-scrolling contour with EMA smoothing, trend arrows, and range bands was replaced by this approach. The contour computed summaries that lagged behind the input, misrepresented chord dynamics by averaging individual notes, and obscured the temporal texture of the playing.

**Counterexample:**

Chord detection is a valid use of synthesis. The viewer cannot perceive "this is a dominant seventh chord" from individual pitch-class hue assignments — that requires recognising an interval pattern across simultaneous notes. The system must do that work and present the result.

## Anti-Principles
- Magic without explanation
- Configuration without mental models
- Optimisation without measurement

