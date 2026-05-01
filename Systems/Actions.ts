// Systems/Actions.ts – complete: clone, tab switch (CSV‑driven highlight), keyboard shortcuts, drag, resize, delete
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { panelEntities, panelSourceFile, originalVisible, selectedPanelName } from '../Ui/Panel.js';
import { parseCsvArray } from '../parseCsv.js';
import {
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  DragComponent,
  SelectableComponent,
  ImageComponent,
  ScriptedActionsComponent,
  Entity,
} from '../Core/ECS.js';
import { Input } from '../Controls/Input.js';
import { StartDrag } from '../Controls/Movement.js';
import { registerScript } from './ScriptRunner.js';

let resizeMode = false;

// Nav button → area name
const areaNavMap: Record<string, string> = {
  sheet_area:         'nav_sheets',
  spellbook_area:     'nav_spellbook',
  board_area:         'nav_board',
  sheet_editor_area:  'nav_sheet_editor',
  map_editor_area:    'nav_map_editor',
  image_editor_area:  'nav_image_editor',
  system_editor_area: 'nav_system_editor',
};

async function Load() {
  const response = await fetch('Systems/Actions.csv');
  const text = await response.text();
  const rows = parseCsvArray(text);

  for (const row of rows) {
    const actionId = row['action_id'];
    const operation = row['operation'];
    if (!actionId || !operation) continue;

    switch (operation) {
      case 'clone_entity':
        registerScript(actionId, () => cloneEntity(row['template'], row['target_parent']));
        break;
      case 'set_move_mode':
        registerScript(actionId, () => { resizeMode = false; });
        break;
      case 'set_resize_mode':
        registerScript(actionId, () => { resizeMode = true; });
        break;
      case 'delete_selected':
        registerScript(actionId, () => deleteSelectedEntity());
        break;
    }
  }

  // ---------------------------------------------------------------
  // Scripts called by Selection.ts
  // ---------------------------------------------------------------

  registerScript('begin_drag', (payload: any) => {
    const { panelName, mouseX, mouseY, ruleActionId } = payload;
    const edge = resizeMode ? detectResizeEdge(panelName, mouseX, mouseY) : null;
    const ruleId = ruleActionId || 'drag_xy';
    if (resizeMode && edge) {
      StartDrag(panelName, { x: mouseX, y: mouseY }, 'drag_x', edge);
    } else if (!resizeMode) {
      StartDrag(panelName, { x: mouseX, y: mouseY }, ruleId);
    }
  });

  registerScript('toggle_interface', (payload: any) => {
    const { ruleActionId: areaName } = payload;
    toggleTabArea(areaName);
    // Set CSV‑driven selection – Hover.ts will paint it automatically
    const navBtnName = areaNavMap[areaName];
    if (navBtnName) {
      selectedPanelName = navBtnName;
    }
  });

  registerScript('delete_entity', (payload: any) => {
    const { panelName } = payload;
    deleteEntityByName(panelName);
  });

  registerScript('select_entity', (payload: any) => {
    const { panelName } = payload;
    const entity = panelEntities.get(panelName);
    if (entity) {
      const world = getWorld();
      const mat = world.getComponent<MaterialComponent>(entity, 'MaterialComponent');
      if (mat) {
        mat.color = { r: 0.3, g: 0.5, b: 0.8, a: 1 };
        world.setComponent(entity, mat);
      }
    }
  });

  // Dummy to avoid “not defined” errors on old dropdown rules
  registerScript('toggle_dropdown', () => {});

  console.log(`[Actions] Scripts registered`);
}

// ---------- KEYBOARD SHORTCUTS (G / S) ----------
function Update() {
  if (Input._held.has('KeyG')) resizeMode = false;
  if (Input._held.has('KeyS')) resizeMode = true;
}

// ---------------------------------------------------------------
// Clone (add‑sheet‑box)
// ---------------------------------------------------------------
function cloneEntity(templateName: string, targetParentName: string) {
  const world = getWorld();
  const templateEntity = panelEntities.get(templateName);
  if (!templateEntity) return;

  const t = world.getComponent<TransformComponent>(templateEntity, 'TransformComponent');
  const p = world.getComponent<PanelComponent>(templateEntity, 'PanelComponent');
  const m = world.getComponent<MaterialComponent>(templateEntity, 'MaterialComponent');
  const d = world.getComponent<DragComponent>(templateEntity, 'DragComponent');

  if (!t || !p) return;

  const newEntity = world.createEntity();
  const mouse = Input.MousePos;

  world.addComponent<TransformComponent>(newEntity, {
    type: 'TransformComponent',
    position: { x: mouse.x, y: mouse.y, z: 0 },
    scale: { ...t.scale },
    rotation: { ...t.rotation },
  });

  world.addComponent<PanelComponent>(newEntity, {
    type: 'PanelComponent',
    ...p,
    visible: true,
  });

  if (m) world.addComponent<MaterialComponent>(newEntity, { type: 'MaterialComponent', ...m });

  if (d) {
    world.addComponent<DragComponent>(newEntity, {
      type: 'DragComponent',
      ...d,
      parentNameId: targetParentName || d.parentNameId,
      movementId: d.movementId || 'drag_xy',
    });
  }

  world.addComponent<SelectableComponent>(newEntity, {
    type: 'SelectableComponent',
    clickable: true,
    visible: true,
    layer: p.layer,
  });

  const scriptComp: ScriptedActionsComponent = {
    type: 'ScriptedActionsComponent',
    leftClickScript: 'begin_drag',
  };
  world.addComponent(newEntity, scriptComp);

  const uniqueName = `_box_${newEntity.index}`;
  panelEntities.set(uniqueName, newEntity);
  const areaFile = panelSourceFile.get(targetParentName) ?? 'PanelCore.csv';
  panelSourceFile.set(uniqueName, areaFile);

  world.executeCommands();
  StartDrag(uniqueName, { x: mouse.x, y: mouse.y }, 'drag_xy');
  console.log(`[Actions] Cloned ${templateName} → ${uniqueName}`);
}

// ---------------------------------------------------------------
// Tab switching – NEVER overrides CSV visibility
// ---------------------------------------------------------------
function toggleTabArea(areaName: string) {
  const world = getWorld();
  const areaFile = panelSourceFile.get(areaName);
  if (!areaFile) return;

  for (const [pname, entity] of panelEntities) {
    const file = panelSourceFile.get(pname) ?? 'PanelCore.csv';
    if (file === 'PanelCore.csv') continue;

    const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
    if (!panel) continue;

    const csvVisible = originalVisible.get(pname) ?? true;
    if (file === areaFile) {
      panel.visible = csvVisible;
    } else {
      panel.visible = false;
    }
    world.setComponent(entity, panel);
  }
  console.log(`[Actions] Switched to "${areaName}"`);
}

// ---------------------------------------------------------------
// Delete
// ---------------------------------------------------------------
function deleteSelectedEntity() { /* implement when needed */ }

function deleteEntityByName(name: string) {
  const world = getWorld();
  const entity = panelEntities.get(name);
  if (!entity) return;
  const img = world.getComponent<ImageComponent>(entity, 'ImageComponent');
  if (img?.sprite) {
    img.sprite.parent?.removeChild(img.sprite);
    img.sprite.destroy();
  }
  panelEntities.delete(name);
  panelSourceFile.delete(name);
  world.destroyEntity(entity);
}

// ---------------------------------------------------------------
// Edge detection for self‑resize
// ---------------------------------------------------------------
function detectResizeEdge(panelName: string, mouseX: number, mouseY: number): string | null {
  const world = getWorld();
  const entity = panelEntities.get(panelName);
  if (!entity) return null;
  const t = world.getComponent<TransformComponent>(entity, 'TransformComponent');
  if (!t) return null;

  const x = t.position.x - t.scale.x * 0.5;
  const y = t.position.y - t.scale.y * 0.5;
  const w = t.scale.x;
  const h = t.scale.y;

  const THRESHOLD = 8;
  if (mouseX - x <= THRESHOLD)                return 'left';
  if ((x + w) - mouseX <= THRESHOLD)          return 'right';
  if (mouseY - y <= THRESHOLD)                return 'top';
  if ((y + h) - mouseY <= THRESHOLD)          return 'bottom';
  return null;
}

// Register Load and Update with the Scheduler
registerSystemMethod('SETUE.Systems.Actions', 'Load', Load);
registerSystemMethod('SETUE.Systems.Actions', 'Update', Update);
