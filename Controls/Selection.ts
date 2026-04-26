import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input, IsActionPressed, ConsumeAction } from './Input.js';
import { panelRegions, panelEntities } from '../Ui/Panel.js';
import { Entity, PanelComponent, MaterialComponent, DragComponent } from '../Core/ECS.js';

interface Rule {
  id: string;
  inputAction: string;
  hitTestType: string;
  hitTestValue: string;
  onClickOperation: string;
  consumeInput: boolean;
  actionId: string;
}

let rules: Rule[] = [];
let hoveredEntity: Entity | null = null;
let hoverColor = { r: 0, g: 0, b: 0, a: 0 };
let hoverStored = false;
let selectedEntity: Entity | null = null;
let selectedColor = { r: 0, g: 0, b: 0, a: 0 };
let selectedStored = false;
let openDropdownName: string | null = null;

const HOVER_BRIGHTNESS = 1.3;
const SELECTED_COLOR = { r: 0.3, g: 0.5, b: 0.8, a: 1.0 };

function Load() {
  return fetch('Controls/Selection.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text);
      rules = rows
        .filter(r => r['input_action'])
        .map(r => ({
          id: r['id'] ?? '',
          inputAction: r['input_action'] ?? '',
          hitTestType: r['hit_test_type'] ?? '',
          hitTestValue: r['hit_test_value'] ?? '',
          onClickOperation: r['on_click_operation'] ?? '',
          consumeInput: r['consume_input'] === 'true',
          actionId: r['action_id'] ?? '',
        }));
      console.log(`[Selection] Loaded ${rules.length} rules`);
    });
}

function Update() {
  const world = getWorld();
  const mouse = Input.MousePos;

  // --- Hover (unchanged) ---
  // ...

  // --- Click ---
  const pressedAction = IsActionPressed('select_object') ? 'select_object' : IsActionPressed('context_menu') ? 'context_menu' : null;
  if (!pressedAction) return;

  let bestLayer = -Infinity;
  let bestName: string | null = null;
  let bestRule: Rule | null = null;

  for (const rule of rules) {
    if (rule.inputAction !== pressedAction) continue;
    const hitName = hitTest(rule, mouse);
    if (!hitName) continue;
    const entity = panelEntities.get(hitName);
    if (!entity) continue;
    const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
    if (!panel) continue;
    if (panel.layer > bestLayer) {
      bestLayer = panel.layer;
      bestName = hitName;
      bestRule = rule;
    }
  }

  if (!bestName || !bestRule) {
    closeOpenDropdown();
    return;
  }

  ConsumeAction(pressedAction);

  const op = bestRule.onClickOperation.toLowerCase();
  const actionId = bestRule.actionId;

  let targetPanelName: string | null = null;

  if (op === 'toggle_visibility') {
    targetPanelName = bestName;
  } else if (op === '' && actionId) {
    targetPanelName = actionId;           // e.g., "header_file_menu"
  } else if (op === 'start_drag') {
    import('./Movement.js').then(m => m.StartDrag(bestName!, mouse, actionId));
    return;
  } else if (op === 'select') {
    const entity = panelEntities.get(bestName)!;
    setSelectedEntity(entity);
    closeOpenDropdown();
    return;
  } else {
    targetPanelName = actionId || bestName;
  }

  if (targetPanelName) {
    toggleDropdown(targetPanelName);
  }
}

function hitTest(rule: Rule, mouse: { x: number; y: number }): string | null {
  const candidates: { name: string; layer: number }[] = [];
  for (const [name, region] of panelRegions) {
    const entity = panelEntities.get(name);
    if (!entity) continue;
    const panel = getWorld().getComponent<PanelComponent>(entity, 'PanelComponent');
    if (!panel || !panel.visible || !panel.clickable) continue;
    if (mouse.x < region.x || mouse.x > region.x + region.width || mouse.y < region.y || mouse.y > region.y + region.height) continue;

    if (rule.hitTestType === 'panel_prefix') {
      if (name.startsWith(rule.hitTestValue)) candidates.push({ name, layer: panel.layer });
    } else if (rule.hitTestType && name === rule.hitTestType) {
      candidates.push({ name, layer: panel.layer });
    }
  }
  candidates.sort((a, b) => b.layer - a.layer);
  return candidates.length > 0 ? candidates[0].name : null;
}

/** Toggle panel visibility and also toggle all its children recursively */
function toggleDropdown(panelName: string) {
  const world = getWorld();
  const entity = panelEntities.get(panelName);
  if (!entity) return;
  const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
  if (!panel) return;

  // Close previous open dropdown (and its children)
  if (openDropdownName && openDropdownName !== panelName) {
    closeDropdown(openDropdownName);
  }

  // Toggle this panel
  const newVisible = !panel.visible;
  panel.visible = newVisible;
  world.setComponent(entity, panel);

  // Toggle all children that have this panel as parent
  setChildrenVisibility(panelName, newVisible);

  openDropdownName = newVisible ? panelName : null;
}

/** Recursively set visibility of all child panels whose parent_name matches the given parent */
function setChildrenVisibility(parentName: string, visible: boolean) {
  const world = getWorld();
  for (const [childName, childEntity] of panelEntities) {
    const dragComp = world.getComponent<DragComponent>(childEntity, 'DragComponent');
    if (!dragComp) continue;
    if (dragComp.parentNameId === parentName) {
      const childPanel = world.getComponent<PanelComponent>(childEntity, 'PanelComponent');
      if (childPanel) {
        childPanel.visible = visible;
        world.setComponent(childEntity, childPanel);
        // Recursively handle grandchildren
        setChildrenVisibility(childName, visible);
      }
    }
  }
}

function closeDropdown(panelName: string) {
  const entity = panelEntities.get(panelName);
  if (!entity) return;
  const panel = getWorld().getComponent<PanelComponent>(entity, 'PanelComponent');
  if (panel && panel.visible) {
    panel.visible = false;
    getWorld().setComponent(entity, panel);
    setChildrenVisibility(panelName, false);   // hide children too
  }
}

function closeOpenDropdown() {
  if (openDropdownName) {
    closeDropdown(openDropdownName);
    openDropdownName = null;
  }
}

function setSelectedEntity(entity: Entity) {
  // unchanged
}

registerSystemMethod('SETUE.Controls.Selection', 'Load', Load);
registerSystemMethod('SETUE.Controls.Selection', 'Update', Update);
