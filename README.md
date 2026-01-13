# Synesthetica

## Overview
Synesthetica is a software project developed through a **recursive, self-documenting discussion process**. Rather than separating thinking from implementation, we incrementally explore ideas, crystallise them into concrete specifications, and ultimately derive working software from those specs.

The end goal is a piece of software that listens to **MIDI note data** and **raw audio input** and generates **real-time visualisations**. The primary use case is as a *synesthetic aid for ear training* (e.g. mapping harmony played on a keyboard to colour/shape patterns that can be matched on guitar). A secondary use case is as a **custom visual component for live performance**.

## How We Work
Our workflow embraces early ambiguity while enforcing discipline as ideas mature.

**Core loop per session:**
1. Freeform discussion and exploration
2. Identification of concrete outcomes
3. Patch one or more canonical documents (unless explicitly agreed otherwise)
4. Record open questions and next decisions

Exploration that does *not* lead to decisions is still valuable, but only agreed conclusions are promoted into specs.

Results are reproducible from specifications and documented decisions, and do not rely on ephemeral chat context.

## Document Taxonomy
The repository is organised around a small, explicit set of document types:

- **VISION** – What we are building and why
- **PRD** – Product requirements and success criteria
- **SPECS** – Technical specifications by subsystem
- **ADR** – Architecture Decision Records (decisions + rationale)
- **RFC** – Proposals and ideas under discussion
- **PRINCIPLES** – Fundamental values and constraints guiding all decisions
- **GLOSSARY** – Shared terminology
- **TASKS** – Actionable backlog derived from accepted specs (optional)

Each document has a stable ID, clear status, and explicit dependencies where relevant.

## Document Conventions
All canonical documents should include lightweight frontmatter:

- `id`
- `status` (draft | accepted | superseded)
- `owner`
- `last_updated`
- `depends_on` (optional)

Significant changes should either:
- create a new version (e.g. `-v2`), or
- explicitly mark a document as superseded

## Principles
High-level principles live in `PRINCIPLES.md` and act as *constraints*, not aspirations. If a design violates a principle, that violation must be explicit and justified.

## Index
This README acts as the root index. A more detailed `INDEX.md` may be added once the document set grows.

## Status
The project is in its **formative phase**. Initial documents are skeletal and expected to evolve rapidly.

## Module boundaries
All module boundaries are defined in packages/contracts. Do not redefine types elsewhere.

