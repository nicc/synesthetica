# Grammar Glossary

Terms used in the grammar visualization systems. Organized by grammar.

---

# Harmony Grammar

## Harmony Clock

**Harmony clock**
The circular progression display occupying the bottom-right cell of the harmony column. Shows functional chords as radially-positioned chord numerals that fade with age.

**Guide band**
An annular region within the harmony clock, bounded by guide rings. The harmony clock is divided into guide bands concentrically. The diatonic ring and borrowed ring are both guide bands. Each chord numeral sits at the radial centre of its guide band.

**Diatonic ring**
The inner guide band where chords whose roots are diatonic to the prescribed key sit. Contains seven equally-spaced angular slots, one per scale degree.

**Slot**
One of seven angular positions on the diatonic ring, spaced at 360/7 (approximately 51.4 degrees). Degree I sits at 12 o'clock, proceeding clockwise through VII.

**Borrowed ring**
The outer guide band on the harmony clock, containing chord numerals whose roots are not diatonic to the prescribed key. Angular positions are interpolated between adjacent diatonic ring slots based on chromatic distance from the tonic. Chord numerals on the borrowed ring are scaled by 1/φ relative to the diatonic ring. Chords on the borrowed ring may have weighted functional connections to chords on either ring — including other chords on the borrowed ring itself (e.g. in secondary dominant chains).

**Chord numeral**
A Roman numeral rendered as geometric line segments and arcs (not text). Carries root pitch-class hue. Positioned on its guide band at the angular slot corresponding to its scale degree. Examples: I, ii, V7, ♭III.

**Chord symbol**
The radial wedge/line shape in the top-right cell showing a chord's interval structure. Distinct from chord numerals on the harmony clock.

**Connection strip**
A short gradient mark sitting on the radial edge of a chord numeral or slot on the harmony clock. Connection strips appear in pairs — one at the source chord, one at the target chord — linked by a shared midpoint pitch-class hue. They indicate a functional relationship between chords without drawing lines across the clock face. Strip intensity scales with the connection's conventional weight.

**Fade trail**
The visual afterimage of a released chord on the harmony clock. On release, brightness drops by a step, then decays linearly over the fade window. Stroke width grows as opacity falls, producing a chunky-to-transparent progression.

---

# Rhythm Grammar

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
Controls visibility of note strips. At min horizon, shows approximately 1 beat of history; at max horizon, shows full history.

**Reference window**
Controls visibility of reference lines and drift streaks. Lingers longer than the note window (controlled by `referenceLinger` macro, default 1.3x), allowing these elements to remain visible after note strips have faded. This creates a trailing effect where timing feedback persists after the note itself.

## Visual Elements

**Note strip**
Vertical strip representing a played note. Width varies with velocity; height extends from note onset (top) to note end or NOW line (bottom). Color derived from pitch class palette.

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

**Reference linger** (default 1.3)
Multiplier controlling how long reference lines and streaks remain visible after note strips fade. At 1.3, reference elements persist 30% longer than notes.
