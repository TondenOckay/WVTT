// Controls/Input.ts
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';

interface Binding {
  input: string;
  modifier: string;
  editChar: string;
}

const actionBindings = new Map<string, Binding[]>();
const actionEnabled = new Set<string>();
const held = new Set<string>();
const pressed = new Set<string>();

export const Input = {
  _mouseX: 0, _mouseY: 0, _mouseDX: 0, _mouseDY: 0, _scroll: 0,
  _ctrl: false, _shift: false,

  get MousePos() { return { x: this._mouseX, y: this._mouseY }; },
  get MouseDelta() { return { x: this._mouseDX, y: this._mouseDY }; },
  get ScrollDelta() { return this._scroll; },
  get IsCtrlHeld() { return this._ctrl; },
  get IsShiftHeld() { return this._shift; },

  IsEditing: false, EditBuffer: '', EditSource: '', EditConfirmed: false, EditCancelled: false,
};

function toLogicalCoord(clientX: number, clientY: number): { x: number; y: number } {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function Load() {
  fetch('Controls/Input.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text);
      actionBindings.clear();
      actionEnabled.clear();
      for (const row of rows) {
        const action = row['action'] ?? '';
        const input = row['input'] ?? '';
        const modifier = row['modifier'] ?? '';
        const editChar = row['edit_char'] ?? '';
        if (!action) continue;
        if (!actionBindings.has(action)) actionBindings.set(action, []);
        actionBindings.get(action)!.push({ input, modifier, editChar });
        if (row['enabled'] === 'true') actionEnabled.add(action);
      }
      console.log(`[Input] Loaded ${actionBindings.size} actions`);
    });

  const canvas = document.querySelector('canvas');
  if (canvas) {
    window.addEventListener('mousemove', (e: MouseEvent) => {
      const logical = toLogicalCoord(e.clientX, e.clientY);
      Input._mouseDX = logical.x - Input._mouseX;
      Input._mouseDY = logical.y - Input._mouseY;
      Input._mouseX = logical.x;
      Input._mouseY = logical.y;
    });

    canvas.addEventListener('mousedown', (e: MouseEvent) => {
      const btn = mouseButtonName(e.button);
      held.add(btn);
      pressed.add(btn);
      const logical = toLogicalCoord(e.clientX, e.clientY);
      Input._mouseX = logical.x;
      Input._mouseY = logical.y;
    });

    canvas.addEventListener('mouseup', (e: MouseEvent) => {
      held.delete(mouseButtonName(e.button));
    });

    canvas.addEventListener('wheel', (e: WheelEvent) => {
      Input._scroll = e.deltaY > 0 ? -1 : 1;
    });

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      held.add(e.code);
      pressed.add(e.code);
      Input._ctrl = e.ctrlKey;
      Input._shift = e.shiftKey;
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      held.delete(e.code);
      Input._ctrl = e.ctrlKey;
      Input._shift = e.shiftKey;
    });
  }
}

function mouseButtonName(button: number): string {
  switch (button) {
    case 0: return 'MouseLeft';
    case 1: return 'MouseMiddle';
    case 2: return 'MouseRight';
    default: return 'Mouse' + button;
  }
}

// ------------- modifier‑aware checks -------------
function modifierMatches(desired: string): boolean {
  if (desired === 'Ctrl') return Input._ctrl;
  if (desired === 'Shift') return Input._shift;
  return !desired; // empty string → no modifier must be active
}

export function IsActionHeld(action: string): boolean {
  if (!actionEnabled.has(action)) return false;
  const bindings = actionBindings.get(action);
  if (!bindings) return false;
  for (const { input, modifier } of bindings) {
    if (held.has(input) && modifierMatches(modifier)) return true;
  }
  return false;
}

export function IsActionPressed(action: string): boolean {
  if (!actionEnabled.has(action)) return false;
  const bindings = actionBindings.get(action);
  if (!bindings) return false;
  for (const { input, modifier } of bindings) {
    if (pressed.has(input) && modifierMatches(modifier)) {
      return true;
    }
  }
  return false;
}

export function ConsumeAction(action: string) {
  const bindings = actionBindings.get(action);
  if (!bindings) return;
  for (const { input } of bindings) pressed.delete(input);
}

function Flush() {
  Input._mouseDX = 0;
  Input._mouseDY = 0;
  Input._scroll = 0;
  pressed.clear();
}

registerSystemMethod('SETUE.Controls.Input', 'Load', Load);
registerSystemMethod('SETUE.Controls.Input', 'Flush', Flush);
