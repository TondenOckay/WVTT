// Controls/Selection.ts – fixed toggleTabArea for non‑panel entities
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input, IsActionPressed, ConsumeAction } from './Input.js';
import { panelEntities, panelSourceFile } from '../Ui/Panel.js';
import { BaseWorldData } from '../Core/BaseWorldData.js';
import {
  Entity,
  PanelComponent,
  MaterialComponent,
  TransformComponent,
  DragComponent,
  SelectableComponent,
  ImageComponent,
} from '../Core/ECS.js';
import { runScript } from '../Systems/ScriptRunner.js';
import * as PIXI from 'pixi.js';

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

let selectedContentEntity: Entity | null = null;
let selectedContentColor = { r: 0, g: 0, b: 0, a: 0 };
let contentSelectedStored = false;

let activeTabEntity: Entity | null = null;
let activeTabColor = { r: 0, g: 0, b: 0, a: 0 };
let activeTabStored = false;

let openDropdownName: string | null = null;

const HOVER_BRIGHTNESS = 1.3;
const SELECTED_COLOR = { r: 0.3, g: 0.5, b: 0.8, a: 1.0 };
const IMAGE_HOVER_ALPHA = 0.8;
const IMAGE_SELECT_BORDER_COLOR = 0xffff00;
const IMAGE_SELECT_BORDER_WIDTH = 2;

const imageOriginalAlpha = new Map<number, number>();
const selectionBorders = new Map<number, PIXI.Graphics>();

const entityIndexToName = new Map<number, string>();

function refreshEntityNameMap() {
  entityIndexToName.clear();
  for (const [name, entity] of panelEntities) {
    entityIndexToName.set(entity.index, name);
  }
}

function getPanelName(entity: Entity): string {
  return entityIndexToName.get(entity.index) ?? '';
}

function Load() {
  rules = BaseWorldData.selection
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
}

// ---------- Image hover / selection ----------
function applyImageHover(entity: Entity) {
  const world = getWorld();
  const img = world.getComponent<ImageComponent>(entity, 'ImageComponent');
  if (!img?.sprite) return;
  const sprite = img.sprite as PIXI.Sprite;
  if (!imageOriginalAlpha.has(entity.index)) {
    imageOriginalAlpha.set(entity.index, sprite.alpha);
  }
  sprite.alpha = IMAGE_HOVER_ALPHA;
}

function removeImageHover(entity: Entity) {
  const world = getWorld();
  const img = world.getComponent<ImageComponent>(entity, 'ImageComponent');
  if (!img?.sprite) return;
  const sprite = img.sprite as PIXI.Sprite;
  const orig = imageOriginalAlpha.get(entity.index);
  if (orig !== undefined) {
    sprite.alpha = orig;
    imageOriginalAlpha.delete(entity.index);
  }
}

function addSelectionBorder(entity: Entity) {
  const world = getWorld();
  const img = world.getComponent<ImageComponent>(entity, 'ImageComponent');
  if (!img?.sprite) return;
  const sprite = img.sprite as PIXI.Sprite;

  removeSelectionBorder(entity);

  const border = new PIXI.Graphics();
  border.stroke({ width: IMAGE_SELECT_BORDER_WIDTH, color: IMAGE_SELECT_BORDER_COLOR });
  const bounds = sprite.getBounds();
  border.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  border.stroke();
  border.zIndex = 9999;
  sprite.parent?.addChild(border);
  selectionBorders.set(entity.index, border);
}

function removeSelectionBorder(entity: Entity) {
  const border = selectionBorders.get(entity.index);
  if (border) {
    border.parent?.removeChild(border);
    border.destroy();
    selectionBorders.delete(entity.index);
  }
}

function updateSelectionBorderPosition(entity: Entity) {
  const world = getWorld();
  const img = world.getComponent<ImageComponent>(entity, 'ImageComponent');
  const border = selectionBorders.get(entity.index);
  if (!img?.sprite || !border) return;
  const sprite = img.sprite as PIXI.Sprite;
  const bounds = sprite.getBounds();
  border.clear();
  border.stroke({ width: IMAGE_SELECT_BORDER_WIDTH, color: IMAGE_SELECT_BORDER_COLOR });
  border.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  border.stroke();
}

// --- Active tab highlight ---
function setActiveTab(entity: Entity) {
  const world = getWorld();
  if (activeTabEntity === entity) return;

  if (activeTabEntity && activeTabStored) {
    const mat = world.getComponent<MaterialComponent>(activeTabEntity, 'MaterialComponent');
    if (mat) {
      mat.color = { ...activeTabColor };
      world.setComponent(activeTabEntity, mat);
    }
    activeTabStored = false;
  }

  const mat = world.getComponent<MaterialComponent>(entity, 'MaterialComponent');
  if (mat) {
    activeTabColor = { ...mat.color };
    activeTabStored = true;
    mat.color = SELECTED_COLOR;
    world.setComponent(entity, mat);
  }
  activeTabEntity = entity;
}

// --- Content selection (images, etc.) ---
export function setSelectedEntity(entity: Entity) {
  const world = getWorld();
  if (selectedContentEntity === entity) return;

  if (selectedContentEntity && contentSelectedStored) {
    const matPanel = world.getComponent<MaterialComponent>(selectedContentEntity, 'MaterialComponent');
    if (matPanel) {
      matPanel.color = { ...selectedContentColor };
      world.setComponent(selectedContentEntity, matPanel);
    }
    if (world.hasComponent(selectedContentEntity, 'ImageComponent')) {
      removeSelectionBorder(selectedContentEntity);
    }
    contentSelectedStored = false;
  }

  const matPanel = world.getComponent<MaterialComponent>(entity, 'MaterialComponent');
  if (matPanel) {
    selectedContentColor = { ...matPanel.color };
    contentSelectedStored = true;
    matPanel.color = SELECTED_COLOR;
    world.setComponent(entity, matPanel);
  }
  if (world.hasComponent(entity, 'ImageComponent')) {
    addSelectionBorder(entity);
    contentSelectedStored = true;
  }

  selectedContentEntity = entity;
}

function clearContentSelection() {
  if (selectedContentEntity) {
    const world = getWorld();
    if (contentSelectedStored) {
      const matPanel = world.getComponent<MaterialComponent>(selectedContentEntity, 'MaterialComponent');
      if (matPanel) {
        matPanel.color = { ...selectedContentColor };
        world.setComponent(selectedContentEntity, matPanel);
      }
      if (world.hasComponent(selectedContentEntity, 'ImageComponent')) {
        removeSelectionBorder(selectedContentEntity);
      }
      contentSelectedStored = false;
    }
    selectedContentEntity = null;
  }
}

/**
 * Find the topmost entity at the mouse position.
 * Prefers clickable entities over non‑clickable when layers are equal.
 */
function getTopmostEntityAtMouse(mouse: { x: number; y: number }): { entity: Entity; layer: number } | null {
  const world = getWorld();
  let topLayer = -Infinity;
  let topEntity: Entity | null = null;
  let topIsClickable = false;

  // Panels
  world.forEachIndex2<TransformComponent, PanelComponent>(
    'TransformComponent',
    'PanelComponent',
    (idx, transform, panel) => {
      if (!panel.visible) return;
      const x = transform.position.x - transform.scale.x * 0.5;
      const y = transform.position.y - transform.scale.y * 0.5;
      const w = transform.scale.x;
      const h = transform.scale.y;
      if (mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h) {
        const clickable = panel.clickable;
        if (!topEntity || panel.layer > topLayer || (panel.layer === topLayer && clickable && !topIsClickable)) {
          topLayer = panel.layer;
          topEntity = new Entity(idx, world['generations'][idx]);
          topIsClickable = clickable;
        }
      }
    }
  );

  // Non‑panel selectables (images etc.)
  world.forEachIndex2<SelectableComponent, TransformComponent>(
    'SelectableComponent',
    'TransformComponent',
    (idx, selectable, transform) => {
      if (world.hasComponent(new Entity(idx, 0), 'PanelComponent')) return;
      if (!selectable.visible) return;
      const x = transform.position.x - transform.scale.x * 0.5;
      const y = transform.position.y - transform.scale.y * 0.5;
      const w = transform.scale.x;
      const h = transform.scale.y;
      if (mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h) {
        const clickable = selectable.clickable;
        if (!topEntity || selectable.layer > topLayer || (selectable.layer === topLayer && clickable && !topIsClickable)) {
          topLayer = selectable.layer;
          topEntity = new Entity(idx, world['generations'][idx]);
          topIsClickable = clickable;
        }
      }
    }
  );

  return topEntity ? { entity: topEntity, layer: topLayer } : null;
}

function Update() {
  const world = getWorld();
  refreshEntityNameMap();
  const mouse = Input.MousePos;

  // ---------- HOVER ----------
  const candidates: { entity: Entity; layer: number }[] = [];
  world.forEachIndex2<SelectableComponent, TransformComponent>(
    'SelectableComponent',
    'TransformComponent',
    (idx, selectable, transform) => {
      if (!selectable.visible || !selectable.clickable) return;
      const name = getPanelName(new Entity(idx, 0));
      if (name.startsWith('nav_')) return;

      const x = transform.position.x - transform.scale.x * 0.5;
      const y = transform.position.y - transform.scale.y * 0.5;
      const w = transform.scale.x;
      const h = transform.scale.y;
      if (mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h) {
        const top = getTopmostEntityAtMouse(mouse);
        if (top && top.entity.index === idx) {
          const entity = new Entity(idx, world['generations'][idx]);
          candidates.push({ entity, layer: selectable.layer });
        }
      }
    }
  );

  candidates.sort((a, b) => b.layer - a.layer);
  const newHovered = candidates.length > 0 ? candidates[0].entity : null;

  if (newHovered !== hoveredEntity) {
    if (hoveredEntity && hoverStored && hoveredEntity !== selectedContentEntity) {
      const matPanel = world.getComponent<MaterialComponent>(hoveredEntity, 'MaterialComponent');
      if (matPanel) {
        matPanel.color = { ...hoverColor };
        world.setComponent(hoveredEntity, matPanel);
      }
      if (world.hasComponent(hoveredEntity, 'ImageComponent')) {
        removeImageHover(hoveredEntity!);
      }
      hoverStored = false;
    }

    if (newHovered && newHovered !== selectedContentEntity) {
      const matPanel = world.getComponent<MaterialComponent>(newHovered, 'MaterialComponent');
      if (matPanel) {
        hoverColor = { ...matPanel.color };
        hoverStored = true;
        matPanel.color = {
          r: Math.min(matPanel.color.r * HOVER_BRIGHTNESS, 1),
          g: Math.min(matPanel.color.g * HOVER_BRIGHTNESS, 1),
          b: Math.min(matPanel.color.b * HOVER_BRIGHTNESS, 1),
          a: matPanel.color.a,
        };
        world.setComponent(newHovered, matPanel);
      }
      if (world.hasComponent(newHovered, 'ImageComponent')) {
        applyImageHover(newHovered);
        hoverStored = true;
      }
    }
    hoveredEntity = newHovered;
  }

  if (selectedContentEntity && world.hasComponent(selectedContentEntity, 'ImageComponent')) {
    updateSelectionBorderPosition(selectedContentEntity);
  }

  // ---------- CLICK ----------
  const pressedAction = IsActionPressed('select_object') ? 'select_object'
                      : IsActionPressed('context_menu') ? 'context_menu'
                      : null;
  if (!pressedAction) return;

  const topResult = getTopmostEntityAtMouse(mouse);
  if (!topResult) {
    closeOpenDropdown();
    return;
  }

  const topEntity = topResult.entity;
  const topName = getPanelName(topEntity);
  const selectableTop = world.getComponent<SelectableComponent>(topEntity, 'SelectableComponent');

  if (!selectableTop || !selectableTop.clickable) {
    if (topName === 'image_editor_area') {
      clearContentSelection();
    }
    closeOpenDropdown();
    return;
  }

  let bestRule: Rule | null = null;
  for (const rule of rules) {
    if (rule.inputAction !== pressedAction) continue;
    if (rule.hitTestType === 'panel_prefix' && topName.startsWith(rule.hitTestValue)) {
      bestRule = rule;
      break;
    } else if (rule.hitTestType && topName === rule.hitTestType) {
      bestRule = rule;
      break;
    }
  }

  ConsumeAction(pressedAction);

  if (bestRule) {
    const op = bestRule.onClickOperation.toLowerCase();
    const actionId = bestRule.actionId;

    if (op === 'run_script') {
      if (actionId) runScript(actionId);
      closeOpenDropdown();
      return;
    }
    if (op === 'toggle_interface') {
      toggleTabArea(actionId);
      const navEntity = panelEntities.get(topName);
      if (navEntity) setActiveTab(navEntity);
      closeOpenDropdown();
      return;
    }
    if (op === 'start_drag') {
      import('./Movement.js').then(m => m.StartDrag(topName, mouse, actionId));
      return;
    }
    if (op === 'toggle_visibility' || op === '' || actionId) {
      const target = op === 'toggle_visibility' ? topName : (actionId || topName);
      toggleDropdown(target!);
    } else if (op === 'select') {
      setSelectedEntity(topEntity);
      closeOpenDropdown();
    }
  } else {
    const imgComp = world.getComponent<ImageComponent>(topEntity, 'ImageComponent');
    const dragComp = world.getComponent<DragComponent>(topEntity, 'DragComponent');
    if (imgComp && dragComp) {
      setSelectedEntity(topEntity);
      import('./Movement.js').then(m => m.StartDrag(topName, mouse, dragComp.movementId || 'drag_xy'));
    }
  }
}

// --- Visibility utility (syncs Panel + Selectable + Image sprite) ---
function setEntityVisible(entity: Entity, visible: boolean) {
  const world = getWorld();
  const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
  if (panel) {
    panel.visible = visible;
    world.setComponent(entity, panel);
  }
  const selectable = world.getComponent<SelectableComponent>(entity, 'SelectableComponent');
  if (selectable) {
    selectable.visible = visible;
    world.setComponent(entity, selectable);
  }
  const imgComp = world.getComponent<ImageComponent>(entity, 'ImageComponent');
  if (imgComp?.sprite) {
    imgComp.sprite.visible = visible;
  }
}

function toggleDropdown(panelName: string) {
  const world = getWorld();
  const entity = panelEntities.get(panelName);
  if (!entity) return;
  const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
  if (!panel) return;

  if (openDropdownName && openDropdownName !== panelName) closeDropdown(openDropdownName);

  const newVisible = !panel.visible;
  setEntityVisible(entity, newVisible);
  openDropdownName = newVisible ? panelName : null;
  setChildrenVisibility(panelName, newVisible);
}

function setChildrenVisibility(parentName: string, visible: boolean) {
  const world = getWorld();
  for (const [childName, childEntity] of panelEntities) {
    const dragComp = world.getComponent<DragComponent>(childEntity, 'DragComponent');
    if (!dragComp || dragComp.parentNameId !== parentName) continue;
    setEntityVisible(childEntity, visible);
    setChildrenVisibility(childName, visible);
  }
}

function closeDropdown(panelName: string) {
  const entity = panelEntities.get(panelName);
  if (!entity) return;
  const panel = getWorld().getComponent<PanelComponent>(entity, 'PanelComponent');
  if (panel && panel.visible) {
    setEntityVisible(entity, false);
    setChildrenVisibility(panelName, false);
  }
}

function closeOpenDropdown() {
  if (openDropdownName) { closeDropdown(openDropdownName); openDropdownName = null; }
}

// ---------- TAB SWITCHING (works for entities with or without PanelComponent) ----------
function toggleTabArea(areaName: string) {
  const world = getWorld();
  const areaFile = panelSourceFile.get(areaName);
  if (!areaFile) return;

  for (const [pname, entity] of panelEntities) {
    const file = panelSourceFile.get(pname) ?? 'PanelCore.csv';
    if (file === 'PanelCore.csv') continue;               // core panels are never touched

    const shouldBeVisible = (file === areaFile);           // show only panels from the active tab's file
    setEntityVisible(entity, shouldBeVisible);             // works on panels, selectables, and sprites
  }

  // System editor overlay
  import('../Systems/SystemEditor.js').then(m =>
    m.toggleSystemEditor(areaName === 'system_editor_area')
  );
}

registerSystemMethod('SETUE.Controls.Selection', 'Load', Load);
registerSystemMethod('SETUE.Controls.Selection', 'Update', Update);
