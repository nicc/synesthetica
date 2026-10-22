// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ComputerKeyboardSource } from "../../src/keyboard/ComputerKeyboardSource";
import { KEY_MAP, KEYBOARD_VELOCITY, NATURAL_ORDER } from "../../src/keyboard/keyMap";
import type { MidiMessage } from "../../src/midi/MidiSource";

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

// Two mapped keys and one physical key the map leaves out.
const KEY_A = NATURAL_ORDER[0];
const KEY_B = NATURAL_ORDER[1];
const UNMAPPED = "KeyQ";

let source: ComputerKeyboardSource;
let messages: MidiMessage[];

function press(code: string, init: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

function release(code: string, init: KeyboardEventInit = {}, target: EventTarget = window): void {
  target.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true, cancelable: true, ...init }));
}

/** [status, note, velocity] for each emitted message. */
const decoded = () => messages.map((m) => Array.from(m.data));

beforeEach(() => {
  document.body.innerHTML = "";
  source = new ComputerKeyboardSource();
  messages = [];
  source.onMessage((m) => messages.push(m));
  source.attach();
});
afterEach(() => {
  source.dispose();
});

describe("ComputerKeyboardSource — notes", () => {
  it("key down sends note-on at the keyboard velocity; key up sends note-off", () => {
    const note = KEY_MAP[KEY_A].midiNote;
    press(KEY_A);
    release(KEY_A);
    expect(decoded()).toEqual([
      [NOTE_ON, note, KEYBOARD_VELOCITY],
      [NOTE_OFF, note, 0],
    ]);
    expect(messages.every((m) => m.inputId === source.getInputs()[0].id)).toBe(true);
  });

  it("holds several keys independently", () => {
    press(KEY_A);
    press(KEY_B);
    release(KEY_A);
    expect(decoded()).toEqual([
      [NOTE_ON, KEY_MAP[KEY_A].midiNote, KEYBOARD_VELOCITY],
      [NOTE_ON, KEY_MAP[KEY_B].midiNote, KEYBOARD_VELOCITY],
      [NOTE_OFF, KEY_MAP[KEY_A].midiNote, 0],
    ]);
    expect([...source.getPressedKeys()]).toEqual([KEY_B]);
  });

  it("suppresses OS auto-repeat: one note-on per physical press", () => {
    press(KEY_A);
    press(KEY_A, { repeat: true });
    press(KEY_A, { repeat: true });
    expect(decoded().filter(([status]) => status === NOTE_ON)).toHaveLength(1);
  });

  it("ignores a second keydown for a key already held even without the repeat flag", () => {
    press(KEY_A);
    press(KEY_A);
    expect(messages).toHaveLength(1);
  });

  it("ignores a keyup for a key that was never pressed", () => {
    release(KEY_A);
    expect(messages).toEqual([]);
  });

  it("maps by KeyboardEvent.code, not .key", () => {
    // Shift, caps lock or a non-US layout change .key; .code is the physical key.
    press(KEY_A, { key: "Q" });
    press(UNMAPPED, { key: "z" });
    expect(decoded()).toEqual([[NOTE_ON, KEY_MAP[KEY_A].midiNote, KEYBOARD_VELOCITY]]);
  });

  it("leaves Cmd / Ctrl / Alt shortcuts to the browser: no note, default not prevented", () => {
    for (const modifier of ["metaKey", "ctrlKey", "altKey"] as const) {
      const ev = press(KEY_A, { [modifier]: true });
      expect(ev.defaultPrevented, modifier).toBe(false);
    }
    expect(messages).toEqual([]);
  });

  it("still plays with Shift held", () => {
    press(KEY_A, { shiftKey: true });
    expect(decoded()).toEqual([[NOTE_ON, KEY_MAP[KEY_A].midiNote, KEYBOARD_VELOCITY]]);
  });

  it("prevents the browser default only for mapped keys", () => {
    expect(press(KEY_A).defaultPrevented).toBe(true);
    expect(press(UNMAPPED).defaultPrevented).toBe(false);
  });
});

describe("ComputerKeyboardSource — typing contexts", () => {
  for (const tag of ["input", "textarea", "select"]) {
    it(`does not play while typing in a <${tag}>`, () => {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      const ev = press(KEY_A, {}, el);
      expect(messages).toEqual([]);
      expect(ev.defaultPrevented).toBe(false);
    });
  }

  it("does not play while typing in a contenteditable element", () => {
    const el = document.createElement("div");
    el.contentEditable = "true";
    // jsdom doesn't compute isContentEditable; browsers do. Provide it.
    Object.defineProperty(el, "isContentEditable", { value: true });
    document.body.appendChild(el);
    press(KEY_A, {}, el);
    expect(messages).toEqual([]);
  });

  it("still plays from non-editable elements", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    press(KEY_A, {}, el);
    expect(messages).toHaveLength(1);
  });
});

describe("ComputerKeyboardSource — release on focus loss and detach", () => {
  it("window blur releases every held note", () => {
    press(KEY_A);
    press(KEY_B);
    messages = [];
    window.dispatchEvent(new Event("blur"));
    expect(decoded().map(([status, note]) => [status, note]).sort()).toEqual(
      [
        [NOTE_OFF, KEY_MAP[KEY_A].midiNote],
        [NOTE_OFF, KEY_MAP[KEY_B].midiNote],
      ].sort(),
    );
    expect(source.getPressedKeys().size).toBe(0);
  });

  it("detach releases held notes and stops listening", () => {
    press(KEY_A);
    source.detach();
    expect(decoded().at(-1)).toEqual([NOTE_OFF, KEY_MAP[KEY_A].midiNote, 0]);
    messages = [];
    press(KEY_B);
    expect(messages).toEqual([]);
  });

  it("attach is idempotent — attaching twice doesn't double notes", () => {
    source.attach();
    press(KEY_A);
    expect(messages).toHaveLength(1);
  });
});

describe("ComputerKeyboardSource — subscriptions", () => {
  it("onPressChange fires on press and release; getPressedKeys tracks the held set", () => {
    const seen: string[][] = [];
    source.onPressChange(() => seen.push([...source.getPressedKeys()]));
    press(KEY_A);
    release(KEY_A);
    press(UNMAPPED);
    expect(seen).toEqual([[KEY_A], []]);
  });

  it("unsubscribing from onMessage stops delivery", () => {
    const extra: MidiMessage[] = [];
    const unsubscribe = source.onMessage((m) => extra.push(m));
    unsubscribe();
    press(KEY_A);
    expect(extra).toEqual([]);
    expect(messages).toHaveLength(1);
  });
});
