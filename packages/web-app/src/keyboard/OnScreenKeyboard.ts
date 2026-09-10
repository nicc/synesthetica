/**
 * OnScreenKeyboard — DOM overlay that renders the currently-mapped
 * QWERTY→piano layout at the bottom of the viewport.
 *
 * Layout (mirrors the physical MacBook Pro keyboard):
 *   - Row 1 (top / A row)  = black keys, positioned above the natural
 *                            they sharp. Physical keys where no sharp
 *                            exists (A, F, K) are DROPPED so the
 *                            E-F and B-C piano gaps read as visual
 *                            gaps too — Nic's "only draw the valid
 *                            keys" requirement.
 *   - Row 2 (bottom / Z row) = natural keys, contiguous C4 → E5.
 *
 * Every key face carries:
 *   - Its computer letter, big
 *   - A soft glow in the note's pitch-class hue
 *   - A white outline + label for naturals, black for sharps
 *
 * The keyboard reads a ComputerKeyboardSource for the pressed-state
 * (via onPressChange / getPressedKeys) so key highlights and the
 * pipeline see the exact same events — one source of truth.
 *
 * Positioning: fixed to the bottom-right, sitting under the harmony
 * clock's screen region (the right ~42% of the viewport is the
 * harmony column at the current layout). Doesn't overlap the rhythm
 * lens, which stops well above the bottom band. Height is capped so
 * we don't push the visualiser upward.
 */

import type { ComputerKeyboardSource } from "@synesthetica/adapters";
import { KEY_MAP, KEY_LABEL, NATURAL_ORDER } from "@synesthetica/adapters";
import { pcToHue } from "@synesthetica/contracts";

const NATURAL_KEY_PX = 26;
const NATURAL_KEY_GAP = 3;
const ROW_GAP = 4;

export interface OnScreenKeyboardHandle {
  root: HTMLElement;
  destroy: () => void;
  setReferenceHue: (hue: number) => void;
}

export function mountOnScreenKeyboard(
  host: HTMLElement,
  source: ComputerKeyboardSource,
): OnScreenKeyboardHandle {
  const root = document.createElement("div");
  root.className = "syn-onscreen-keyboard";

  // Two rows: naturals underneath, sharps floating above.
  const stack = document.createElement("div");
  stack.className = "syn-onscreen-keyboard-stack";
  const sharpRow = document.createElement("div");
  sharpRow.className = "syn-onscreen-keyboard-row syn-onscreen-keyboard-sharps";
  const naturalRow = document.createElement("div");
  naturalRow.className = "syn-onscreen-keyboard-row syn-onscreen-keyboard-naturals";
  stack.appendChild(sharpRow);
  stack.appendChild(naturalRow);
  root.appendChild(stack);

  // Track the reference hue so the LLM's set_hue_for_pitch calls
  // rotate the on-screen keyboard palette along with the visualiser.
  let referenceHue = 0;

  // Build one .syn-onscreen-key element per mapped code. Naturals go
  // into the bottom row, sharps into the top row absolutely-positioned
  // so their centres land on the natural-to-natural boundary they
  // sharp.
  const naturalIndex = new Map<string, number>();
  for (let i = 0; i < NATURAL_ORDER.length; i++) {
    naturalIndex.set(NATURAL_ORDER[i], i);
  }

  const naturalWidth = NATURAL_ORDER.length * NATURAL_KEY_PX +
    (NATURAL_ORDER.length - 1) * NATURAL_KEY_GAP;
  naturalRow.style.width = `${naturalWidth}px`;
  sharpRow.style.width = `${naturalWidth}px`;

  const codeToElement = new Map<string, HTMLElement>();

  // Naturals (Z row).
  for (const code of NATURAL_ORDER) {
    const el = buildKeyElement(code, false);
    naturalRow.appendChild(el);
    codeToElement.set(code, el);
  }

  // Sharps (A row) — absolutely positioned above their natural's
  // right edge.
  for (const [code, mapping] of Object.entries(KEY_MAP)) {
    if (!mapping.isBlack) continue;
    if (!mapping.sharpsWhichNatural) continue;
    const natIdx = naturalIndex.get(mapping.sharpsWhichNatural);
    if (natIdx === undefined) continue;
    const el = buildKeyElement(code, true);
    // Sharp centre sits on the boundary between this natural and the next.
    const natCentre = natIdx * (NATURAL_KEY_PX + NATURAL_KEY_GAP)
      + NATURAL_KEY_PX
      + NATURAL_KEY_GAP / 2;
    el.style.left = `${natCentre - NATURAL_KEY_PX / 2}px`;
    sharpRow.appendChild(el);
    codeToElement.set(code, el);
  }

  applyHues();

  const unsubscribe = source.onPressChange(() => {
    const pressed = source.getPressedKeys();
    for (const [code, el] of codeToElement) {
      el.classList.toggle("is-pressed", pressed.has(code));
    }
  });

  host.appendChild(root);
  reposition();
  const onResize = () => reposition();
  window.addEventListener("resize", onResize);

  function buildKeyElement(code: string, isBlack: boolean): HTMLElement {
    const el = document.createElement("div");
    el.className = "syn-onscreen-key";
    if (isBlack) el.classList.add("is-black");
    else el.classList.add("is-white");
    el.dataset.code = code;
    el.textContent = KEY_LABEL[code] ?? code;
    el.style.width = `${NATURAL_KEY_PX}px`;
    el.style.height = `${NATURAL_KEY_PX}px`;
    return el;
  }

  function applyHues(): void {
    for (const [code, mapping] of Object.entries(KEY_MAP)) {
      const el = codeToElement.get(code);
      if (!el) continue;
      const pc = mapping.midiNote % 12;
      const hue = pcToHue(pc, { referencePc: 0, referenceHue });
      el.style.setProperty("--syn-key-hue", `${hue}`);
    }
  }

  /**
   * Position the keyboard so its horizontal centre lands under the
   * progression clock and its vertical centre sits midway between
   * the clock's bottom edge and the viewport's bottom edge.
   *
   * The clock's on-screen x depends on the current canvas aspect —
   * the ThreeJS perspective camera keeps worldHeight (75) exactly
   * filling the viewport vertically, so horizontal world extent is
   * `75 × aspect`. The clock centre sits at world x = 79 (from
   * HARMONY_LEFT + HARMONY_COLUMN_WIDTH/2 in the layout module,
   * times worldWidth = 100). Its viewport-x fraction reduces to
   * `29 / (75·aspect) + 0.5` — 0.5 when the world fills the viewport
   * horizontally, drifting further right as the viewport widens.
   *
   * Vertical: the clock's bottom edge is at worldY = 12.375
   * (HARMONY_STACK_TOP + HARMONY_STACK_HEIGHT), which lands at
   * viewport y-fraction 0.835 across every aspect ratio. Halfway
   * between there and the bottom is 0.9175.
   */
  function reposition(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw <= 0 || vh <= 0) return;
    const aspect = vw / vh;
    const clockXFraction = 29 / (75 * aspect) + 0.5;
    root.style.left = `${clockXFraction * vw}px`;
    // Vertical centre slightly higher than midway between the clock
    // bottom (0.835·vh) and the viewport bottom — visually the
    // midpoint reads a touch low against the clock's outer ring, so
    // lift by ~1.75% of viewport height.
    root.style.top = `${0.9 * vh}px`;
    root.style.bottom = "auto";
    root.style.transform = "translate(-50%, -50%)";
  }

  return {
    root,
    destroy: () => {
      unsubscribe();
      window.removeEventListener("resize", onResize);
      root.remove();
    },
    setReferenceHue: (hue: number) => {
      referenceHue = ((hue % 360) + 360) % 360;
      applyHues();
    },
  };
}

/** Ordered natural row width — exported for callers that need to
 *  align other overlays to the keyboard footprint. */
export const NATURAL_ROW_PX =
  NATURAL_ORDER.length * NATURAL_KEY_PX +
  (NATURAL_ORDER.length - 1) * NATURAL_KEY_GAP;

// Row-gap constant re-exported so index.html's inline stylesheet
// can reserve enough space above the keyboard without importing
// a whole layout module.
export { ROW_GAP as ON_SCREEN_KEYBOARD_ROW_GAP };
