# Principles

Principles are constraints, not aspirations. A design that violates one must say so, on purpose, with a reason.

## 1. Functional first
Prefer immutability, explicit data flow and referential transparency. Stateful or imperative code must earn its place.

## 2. Simplicity over cleverness
Choose the simplest thing that works. Avoid premature abstraction. Optimise for understandability over novelty.

## 3. Emergent power from primitives
Prefer a few well-designed primitives with wide, meaningful ranges. New capability should come from composition, interaction and parameter extremes; don't add a feature that existing primitives can express. Treat edge cases as expressive territory, not accidents. Design components as instruments, not utilities: expressive across their range, sensitive to interaction, rewarding mastery.

A good system feels deeper over time without growing more complex.

## 4. Perceptual honesty
- **Measure** accurately and consistently, relative to established musical structure (beat, subdivision, harmony). Report what happened, not what the player meant.
- **Show** mappings that reflect meaningful musical structure, never arbitrary or misleading ones. Learning and intuition over spectacle.
- **Never claim** intent (why the player did it), correctness (whether it was right) or judgement (whether it was good).

## 5. Real-time respect
Predictable behaviour, graceful degradation under load, no hidden blocking or unbounded work in the hot path.

## 6. Composability
Components are independently understandable, compose through clear interfaces, and don't couple across domains (audio, MIDI, visuals).

## 7. Exploratory by design
Support experimentation. Make parameters inspectable and adjustable. Don't lock in aesthetic or pedagogical assumptions early.

## 8. Experiential feedback through simulation
When behaviour is hard to describe or predict, build a diagnostic simulation with realistic input, log internal state and decision points, and analyse the output together before proposing changes. Watching the system operate exposes edge cases that description misses, and gives agents a feedback loop that doesn't depend on a human describing how something feels. Example: test beat detection with simulated MIDI (subdivisions, rubato, tempo changes) rather than describing what feels wrong.

**At design time too.** When a design makes a checkable claim (a level survives a threshold, an element fits a gap, a case shows an effect), compute it against the real constants before agreeing to the design; a throwaway script is usually enough. Specific prose feels verified; it isn't. Prioritise the claims that justify the design (success criteria, why a default was chosen, the case a feature exists to show), because an error there becomes a test assertion, a spec sentence and a tuning target.

Example: RFC 012 claimed a minor-third dyad shows no overtone reinforcement, rolloff 2.0 keeps the 7th partial visible, and a thinner overtone strip reads as distinct from a played note. A short script found the opposite each time: the minor third reinforces more than the major third, rolloff 2.0 leaves the 7th partial at 2%, and the thinner strip sits entirely behind the note it reinforces. All three were caught before code was written.

## 9. Observation over synthesis
Show what happened; let perception find the pattern. Where a property can be shown directly (each note's velocity as a position, each onset as a mark), prefer that to computed summaries such as averages, trend lines or smoothing. The eye extracts range, consistency and motion well. A computed summary only approximates what the viewer would have perceived, and risks asserting structure that isn't there.

This is a default. Synthesis earns its place when the pattern can't be perceived directly (key centre from pitch-class distribution), exceeds visual memory (long-range harmonic progression), or is cross-domain and non-obvious (rhythmic stability from onset drift against a beat grid).

Example: the dynamics lens shows each onset as a positioned indicator that fades. The viewer reads range, consistency, crescendo and rhythmic character without the system computing any of them. It replaced a smoothed contour with trend arrows and range bands that lagged the input, averaged chord notes together and hid the texture of the playing.

Counterexample: chord detection. A viewer can't see "dominant seventh" in individual pitch-class hues; the system has to recognise the interval pattern and show the result.

## Anti-principles
Magic without explanation. Configuration without mental models. Optimisation without measurement.
