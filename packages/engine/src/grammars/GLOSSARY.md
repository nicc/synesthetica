# RhythmGrammar Glossary

Terms used in the rhythm grammar visualization system.

## Time and Positioning

**Time horizon scale**
Fixed mapping from time to screen position. Determines where a given timestamp appears on screen, independent of what's currently visible. Default: 8000ms history, 2000ms future.

**NOW line**
Horizontal line indicating the current moment. Positioned at y=0.85 (15% from screen bottom). Time flows bottom-to-top: past scrolls up above the NOW line, future approaches from below.

## Visible Windows

Windows control filtering (what's shown), not positioning (where it's shown). All windows use the fixed time horizon scale for positioning.

**Grid window**
Controls visibility of beat lines and bar lines. Scales linearly with the horizon macro. At min horizon, few grid lines visible; at max horizon, full grid history shown.

**Note window**
Controls visibility of note bars. At min horizon, shows approximately 1 beat of history; at max horizon, shows full history.

**Reference window**
Controls visibility of reference lines and drift streaks. Lingers 1.2x longer than the note window, allowing these elements to remain visible after note bars have faded. This creates a trailing effect where timing feedback persists briefly after the note itself.

## Visual Elements

**Note bar**
Vertical bar representing a played note. Width varies with velocity; height extends from note onset (top) to note end or NOW line (bottom). Color derived from pitch class palette.

**Beat line**
Horizontal line marking beat positions in the grid. Tier 2+ only (requires tempo).

**Bar line**
Emphasized horizontal line marking measure boundaries. Tier 3 only (requires tempo and meter).

**Reference line**
Short horizontal mark showing where the nearest subdivision was relative to a note's actual onset. Appears through the note at the subdivision position. Part of the reference window.

**Drift streak**
Set of short, gestural lines fanning from a note toward where the beat was. Comic book-style motion lines indicating timing drift. Only shown when drift exceeds tight tolerance (30ms). Part of the reference window.

- Late notes (positive drift): streaks point down (toward past beat)
- Early notes (negative drift): streaks point up (toward future beat)

## Tiers

**Tier 1**: No tempo or meter. Only notes and NOW line rendered.

**Tier 2**: Tempo available. Beat grid lines rendered.

**Tier 3**: Tempo and meter available. Bar lines rendered in addition to beat lines.

## Macros

**Horizon** (0-1)
Controls field of vision. At 0, minimal history shown (tight focus on present). At 1, full history visible.

**Subdivision depth** (quarter | 8th | 16th)
Which subdivision to use for drift calculation. Finer subdivisions catch smaller timing deviations.
