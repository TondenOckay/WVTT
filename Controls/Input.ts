// Controls/Input.ts – hardware tracker + unified CSV rule engine
import { registerSystemMethod } from '../Core/Scheduler.js';
import { parseCsvArray } from '../parseCsv.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { BaseWorldData } from '../Core/BaseWorldData.js';
import {
  CursorState,
  DragRequest,
  SwitchTabRequest,
  CloneRequest,
  RunScriptRequest,
  Entity,
} from '../Core/ECS.js';
import { hoveredEntityId, hoveredObjectName } from '../Systems/Cursor.js';

// ---------------------------------------------------------------------------
// Hardware bindings
// ---------------------------------------------------------------------------
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
  _mouseX: 0, _mouseY: 0, _mouseDX: 0, _mouseDY: 0,
  _scroll: 0, _ctrl: false, _shift: false,
  _held: held, _pressed: pressed,
  get MousePos() { return { x: this._mouseX, y: this._mouseY }; },
  get MouseDelta() { return { x: this._mouseDX, y: this._mouseDY }; },
  get ScrollDelta() { return this._scroll; },
  get IsCtrlHeld() { return this._ctrl; },
  get IsShiftHeld() { return this._shift; },
};

// ---------------------------------------------------------------------------
// Original action helpers (used by Camera, etc.)
// ---------------------------------------------------------------------------
function modifierMatches(desired: string) {
  if (desired === 'Ctrl') return Input._ctrl;
  if (desired === 'Shift') return Input._shift;
  return !desired;
}

export function IsActionHeld(action: string) {
  if (!actionEnabled.has(action)) return false;
  const bindings = actionBindings.get(action);
  if (!bindings) return false;
  for (const { input, modifier } of bindings) {
    if (held.has(input) && modifierMatches(modifier)) return true;
  }
  return false;
}

export function IsActionPressed(action: string) {
  if (!actionEnabled.has(action)) return false;
  const bindings = actionBindings.get(action);
  if (!bindings) return false;
  for (const { input, modifier } of bindings) {
    if (pressed.has(input) && modifierMatches(modifier)) return true;
  }
  return false;
}

export function ConsumeAction(action: string) {
  const bindings = actionBindings.get(action);
  if (!bindings) return;
  for (const { input } of bindings) pressed.delete(input);
}

// ---------------------------------------------------------------------------
// Ring‑buffer event queue (for tab switching, etc.)
// ---------------------------------------------------------------------------
export interface UIEvent {
  kind: 'TabSwitch';
  data: { entityId: number; areaName?: string };
}
const EVENT_QUEUE_SIZE = 1024;
const eventQueue: UIEvent[] = new Array(EVENT_QUEUE_SIZE);
let eventHead = 0, eventTail = 0;

export function pushUIEvent(evt: UIEvent) {
  const next = (eventTail + 1) & (EVENT_QUEUE_SIZE - 1);
  if (next === eventHead) eventHead = (eventHead + 1) & (EVENT_QUEUE_SIZE - 1);
  eventQueue[eventTail] = evt;
  eventTail = next;
  console.log(`[Input] Pushed event: kind=${evt.kind} entity=${evt.data.entityId} area=${evt.data.areaName || 'none'}`);
}

export function popAllUIEvents(): UIEvent[] {
  const out: UIEvent[] = [];
  while (eventHead !== eventTail) {
    out.push(eventQueue[eventHead]);
    eventHead = (eventHead + 1) & (EVENT_QUEUE_SIZE - 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unified interaction rules (loaded from Controls/Input.csv)
// ---------------------------------------------------------------------------
interface InputRule {
  key: string;
  workspace: string;
  object: string;
  actionType: string;
  param: string;
}
let inputRules: InputRule[] = [];
let previousHoveredObjectName: string | null = null;

async function Load() {
  // Hardware bindings from BaseWorldData
  for (const row of BaseWorldData.input) {
    const action = row['action'];
    const input = row['input'] ?? '';
    const modifier = row['modifier'] ?? '';
    const editChar = row['edit_char'] ?? '';
    if (!action) continue;
    if (!actionBindings.has(action)) actionBindings.set(action, []);
    actionBindings.get(action)!.push({ input, modifier, editChar });
    if (row['enabled'] === 'true') actionEnabled.add(action);
  }
  console.log(`[Input] Loaded ${actionBindings.size} bindings`);

  // Load the existing Controls/Input.csv
  try {
    const response = await fetch('Controls/Input.csv');
    const text = await response.text();
    const rows = parseCsvArray(text);
    inputRules = rows
      .filter(r => r['key'])
      .map(r => ({
        key:        r['key'] ?? '',
        workspace:  r['workspace'] ?? '*',
        object:     r['object'] ?? '*',
        actionType: r['action_type'] ?? '',
        param:      r['param'] ?? '',
      }));
    console.log(`[Input] Loaded ${inputRules.length} interaction rules from Input.csv`);
  } catch (err) {
    console.warn('[Input] Controls/Input.csv not found – interaction rules empty');
  }

  // Mouse / keyboard listeners
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

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------
function toLogicalCoord(clientX: number, clientY: number) {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function mouseButtonName(button: number) {
  switch (button) {
    case 0: return 'MouseLeft';
    case 1: return 'MouseMiddle';
    case 2: return 'MouseRight';
    default: return 'Mouse' + button;
  }
}

// ---------------------------------------------------------------------------
// Rule matching & execution
// ---------------------------------------------------------------------------
function matchesObject(pattern: string, objectName: string | null): boolean {
  if (!objectName) return false;
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return objectName.startsWith(pattern.slice(0, -1));
  return pattern === objectName;
}

function findEntityIndexByName(world: any, name: string): number | null {
  const map = (window as any).__PanelNameToIndex as Map<string, number>;
  return map?.get(name) ?? null;
}

function executeAction(world: any, rule: InputRule, entityIndex: number | null, objectName: string | null) {
  if (entityIndex === null) return;
  switch (rule.actionType) {
    case 'add_tag':
      world.addTag(new Entity(entityIndex, world.generations[entityIndex]), rule.param);
      break;
    case 'remove_tag':
      world.removeTag(new Entity(entityIndex, world.generations[entityIndex]), rule.param);
      break;
    case 'SwitchTabRequest':
      pushUIEvent({
        kind: 'TabSwitch',
        data: { entityId: entityIndex, areaName: rule.param || objectName || '' },
      });
      break;
    case 'DragRequest':
      world.createActionEntity<DragRequest>({
        type: 'DragRequest',
        panelName: objectName ?? '',
        movementRule: rule.param,
        mouseX: Input._mouseX,
        mouseY: Input._mouseY,
      });
      break;
    case 'CloneRequest':
      world.createActionEntity<CloneRequest>({
        type: 'CloneRequest',
        templateName: rule.param,
        targetParentName: objectName ?? '',
      });
      break;
    case 'RunScriptRequest':
      world.createActionEntity<RunScriptRequest>({
        type: 'RunScriptRequest',
        scriptName: rule.param,
      });
      break;
  }
}

function applyMatchingRules(world: any, key: string, objectName: string | null, entityIndex: number | null) {
  if (!objectName || entityIndex === null) return;
  for (const rule of inputRules) {
    if (rule.key === key && matchesObject(rule.object, objectName)) {
      executeAction(world, rule, entityIndex, objectName);
    }
  }
}

// ---------------------------------------------------------------------------
// Flush – called every frame, after Cursor
// ---------------------------------------------------------------------------
function Flush() {
  const world = getWorld();

  // 1. Process hover changes
  const currentHoveredName = hoveredObjectName;
  if (currentHoveredName !== previousHoveredObjectName) {
    if (previousHoveredObjectName) {
      const prevIdx = findEntityIndexByName(world, previousHoveredObjectName);
      applyMatchingRules(world, 'hover_leave', previousHoveredObjectName, prevIdx);
    }
    if (currentHoveredName && hoveredEntityId !== null) {
      applyMatchingRules(world, 'hover_enter', currentHoveredName, hoveredEntityId);
    }
    previousHoveredObjectName = currentHoveredName;
  }

  // 2. Process key/click events
  for (const key of pressed) {
    applyMatchingRules(world, key, currentHoveredName, hoveredEntityId);
  }

  // ---- TEMPORARY DIAGNOSTIC ----
  if (pressed.has('MouseLeft') && hoveredEntityId !== null) {
    console.log(`[Input.Flush] Left click detected on entity ${hoveredEntityId} (${hoveredObjectName})`);
  }

  // 3. Clear per‑frame accumulators
  pressed.clear();
  Input._mouseDX = 0;
  Input._mouseDY = 0;
  Input._scroll = 0;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
registerSystemMethod('SETUE.Controls.Input', 'Load', Load);
registerSystemMethod('SETUE.Controls.Input', 'Flush', Flush);
