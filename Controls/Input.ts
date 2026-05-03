// Controls/Input.ts – DIAGNOSTIC (logs key matching / flag setting)
import { registerSystemMethod } from '../Core/Scheduler.js';
import { parseCsvArray } from '../parseCsv.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { BaseWorldData } from '../Core/BaseWorldData.js';
import {
  CursorState,
  Entity,
  MovementFlag,
  CloneFlag,
  RunScriptFlag,
  FollowCursorFlag,
  CurrentSelection,
} from '../Core/ECS.js';
import { hoveredEntityId, hoveredObjectName } from '../Systems/Cursor.js';

// ---------------------------------------------------------------------------
// Hardware bindings
// ---------------------------------------------------------------------------
interface Binding { input: string; modifier: string; editChar: string; }

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

function modifierMatches(desired: string) {
  if (desired === 'Ctrl') return Input._ctrl;
  if (desired === 'Shift') return Input._shift;
  return !desired;
}

export function IsActionHeld(action: string) {
  if (!actionEnabled.has(action)) return false;
  const bindings = actionBindings.get(action);
  if (!bindings) return false;
  for (const { input, modifier } of bindings)
    if (held.has(input) && modifierMatches(modifier)) return true;
  return false;
}

export function IsActionPressed(action: string) {
  if (!actionEnabled.has(action)) return false;
  const bindings = actionBindings.get(action);
  if (!bindings) return false;
  for (const { input, modifier } of bindings)
    if (pressed.has(input) && modifierMatches(modifier)) return true;
  return false;
}

export function ConsumeAction(action: string) {
  const bindings = actionBindings.get(action);
  if (!bindings) return;
  for (const { input } of bindings) pressed.delete(input);
}

// ---------------------------------------------------------------------------
// Ring‑buffer event queue (for TabSwitch only)
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
// CurrentSelection singleton
// ---------------------------------------------------------------------------
let currentSelectionEntity: Entity | null = null;

// ---------------------------------------------------------------------------
// CSV rule definitions (with priority)
// ---------------------------------------------------------------------------
interface InputRule {
  key: string; workspace: string; object: string;
  actionType: string; param: string; flagSystem: string; priority: number;
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

  // Load Controls/Input.csv
  try {
    const resp = await fetch('Controls/Input.csv');
    const text = await resp.text();
    const rows = parseCsvArray(text);
    inputRules = rows
      .filter(r => r['key'])
      .map(r => ({
        key:        r['key'] ?? '',
        workspace:  r['workspace'] ?? '*',
        object:     r['object'] ?? '*',
        actionType: r['action_type'] ?? '',
        param:      r['param'] ?? '',
        flagSystem: r['flag_system'] ?? '',
        priority:   parseInt(r['priority'] ?? '0') || 0,
      }))
      .sort((a, b) => b.priority - a.priority);
    console.log(`[Input] Loaded ${inputRules.length} rules`);
  } catch (err) {
    console.warn('[Input] Controls/Input.csv not found');
  }

  // Create CurrentSelection singleton
  const world = getWorld();
  currentSelectionEntity = world.createEntity();
  world.addComponent<CurrentSelection>(currentSelectionEntity, {
    type: 'CurrentSelection',
    entityId: null,
  });

  // Mouse / keyboard listeners (unchanged)
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
// Rule matching & flag setting
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

function setFlag(world: any, entityIndex: number, flagType: string) {
  const gen = world.generations[entityIndex];
  world.addTag(new Entity(entityIndex, gen), flagType);
  world.executeCommands();
}

function removeFlagOnEntity(world: any, entityIndex: number, flagType: string) {
  const gen = world.generations[entityIndex];
  world.removeTag(new Entity(entityIndex, gen), flagType);
}

function executeAction(world: any, rule: InputRule, entityIndex: number | null, objectName: string | null) {
  if (entityIndex === null) return;

  if (rule.actionType === 'add_tag')    { setFlag(world, entityIndex, rule.param); return; }
  if (rule.actionType === 'remove_tag') { removeFlagOnEntity(world, entityIndex, rule.param); return; }
  if (rule.actionType === 'remove_flag'){ removeFlagOnEntity(world, entityIndex, rule.param); return; }
  if (rule.actionType === 'SelectEntity') {
    if (currentSelectionEntity) {
      const sel = world.getComponent<CurrentSelection>(currentSelectionEntity, 'CurrentSelection');
      if (sel) {
        sel.entityId = entityIndex;
        world.setComponent(currentSelectionEntity, sel);
        world.executeCommands();
      }
    }
    return;
  }

  switch (rule.flagSystem) {
    case 'Movement':      setFlag(world, entityIndex, 'MovementFlag'); break;
    case 'Clone':         setFlag(world, entityIndex, 'CloneFlag'); break;
    case 'RunScript':     setFlag(world, entityIndex, 'RunScriptFlag'); break;
    case 'FollowCursor':  setFlag(world, entityIndex, 'FollowCursorFlag'); break;
    case 'TabSwitch':     pushUIEvent({ kind: 'TabSwitch', data: { entityId: entityIndex, areaName: rule.param || objectName || '' } }); break;
  }
}

function applyGenericRule(world: any, key: string, objectName: string | null, entityIndex: number | null) {
  if (!objectName || entityIndex === null) return;
  for (const rule of inputRules) {
    if (rule.key === key && matchesObject(rule.object, objectName)) {
      executeAction(world, rule, entityIndex, objectName);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Flush – called every frame, after Cursor
// ---------------------------------------------------------------------------
function Flush() {
  const world = getWorld();

  // 1. hover changes
  const curName = hoveredObjectName;
  if (curName !== previousHoveredObjectName) {
    if (previousHoveredObjectName) {
      const prevIdx = findEntityIndexByName(world, previousHoveredObjectName);
      applyGenericRule(world, 'hover_leave', previousHoveredObjectName, prevIdx);
    }
    if (curName && hoveredEntityId !== null) {
      applyGenericRule(world, 'hover_enter', curName, hoveredEntityId);
    }
    previousHoveredObjectName = curName;
  }

  // 2. keys / clicks
  for (const key of pressed) {
    let handledBySelection = false;
    if (currentSelectionEntity) {
      const sel = world.getComponent<CurrentSelection>(currentSelectionEntity, 'CurrentSelection');
      if (sel && sel.entityId !== null) {
        for (const rule of inputRules) {
          if (rule.key === key && rule.actionType === '' && rule.flagSystem !== '' && rule.object === '*') {
            const selName = getPanelName(sel.entityId);
            console.log(`[Input] Key "${key}" matched selected entity ${sel.entityId} "${selName}", setting flag "${rule.flagSystem}"`);
            executeAction(world, rule, sel.entityId, selName);
            handledBySelection = true;
            break;
          }
        }
      }
    }
    if (!handledBySelection) {
      applyGenericRule(world, key, curName, hoveredEntityId);
    }
  }

  // 3. Clear per‑frame accumulators
  pressed.clear();
  Input._mouseDX = 0; Input._mouseDY = 0; Input._scroll = 0;
}

function getPanelName(entityIndex: number): string | null {
  const map = (window as any).__panelEntitiesMap as Map<string, Entity>;
  if (!map) return null;
  for (const [n, e] of map) if (e.index === entityIndex) return n;
  return null;
}

registerSystemMethod('SETUE.Controls.Input', 'Load', Load);
registerSystemMethod('SETUE.Controls.Input', 'Flush', Flush);
