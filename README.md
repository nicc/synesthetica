# Synesthetica

## Overview
Synesthetica listens to **MIDI note data** and **raw audio input** and generates **real-time visualisations**. The primary use case is as a *synesthetic aid for musical hearing and intuition* (e.g. mapping harmony played on a keyboard to colour/shape patterns that can be matched on guitar, illustrating harmonic tension over time, presenting chord qualities in a coherent visual format irrespective of key). A secondary use case is as a **custom visual component for live performance**.

## How We Work
Our workflow embraces early ambiguity while enforcing discipline as ideas mature.

Results are reproducible from specifications and documented decisions, and do not rely on ephemeral chat context.

Issues are tracked using Beads.

## Document Taxonomy
The repository is organised around a small, explicit set of document types:

- **VISION** – What we are building and why
- **PRD** – Product requirements and success criteria
- **SPECS** – Technical specifications by subsystem
- **RFC** – Proposals and ideas under discussion
- **PRINCIPLES** – Fundamental values and constraints guiding all decisions
- **GLOSSARY** – Shared terminology

Each document has a stable ID, clear status, and explicit dependencies where relevant.

## Principles
High-level principles live in `PRINCIPLES.md` and act as *constraints*, not aspirations. If a design violates a principle, that violation must be explicit and justified.

## Index
This README acts as the root index. A more detailed `INDEX.md` may be added once the document set grows.

## Status
The project is in its **formative phase**. Initial documents are skeletal and expected to evolve rapidly.

## Module boundaries
All module boundaries are defined in packages/contracts. Do not redefine types elsewhere.

