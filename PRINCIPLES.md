# Principles

---
id: PRINCIPLES.core-v1
status: draft
owner: user
last_updated: 2026-01-05
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
Mappings between sound, MIDI, and visuals should:
- reflect meaningful musical structure
- avoid arbitrary or misleading representations
- privilege learning and intuition over spectacle

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

## Anti-Principles
- Magic without explanation
- Configuration without mental models
- Optimisation without measurement

