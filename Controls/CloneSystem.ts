// Controls/CloneSystem.ts – watches CloneFlag, creates visible clones that follow the cursor
import { registerSystemMethod } from '../Core/Scheduler.js';
import { parseCsvArray } from '../parseCsv.js';
import { getWorld } from '../Core/GlobalWorld.js';
import {
  panelEntities,
  panelSourceFile,
  layerBuckets,
  updateSpatialIndex,
} from '../Ui/Panel.js';
import {
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  DragComponent,
  SelectableComponent,
  ScriptedActionsComponent,
  MovementGroupComponent,
  MovementGroupEntry,
  FollowCursorFlag,
  CloneFlag,
  Entity,
} from '../Core/ECS.js';
import { Input } from './Input.js';

let cloneRules: { objectName: string; templateName: string }[] = [];

async function Load() {
  const resp = await fetch('Controls/CloneSystem.csv');
  const text = await resp.text();
  const rows = parseCsvArray(text);
  cloneRules = rows.map(r => ({
    objectName: r['object_name'] ?? '',
    templateName: r['template'] ?? '',
  }));
  console.log(`[CloneSystem] Loaded ${cloneRules.length} rules`);
}

function Update() {
  const world = getWorld();

  let flagEntityIndex: number | null = null;
  world.forEachIndex<CloneFlag>('CloneFlag', (idx) => { flagEntityIndex = idx; });

  if (flagEntityIndex === null) return;

  const name = getPanelName(world, flagEntityIndex);
  if (!name) {
    removeFlag(world, flagEntityIndex);
    return;
  }

  const rule = cloneRules.find(r => r.objectName === name);
  if (rule) {
    cloneEntity(rule.templateName, 'sheet_editor_area');
  }

  removeFlag(world, flagEntityIndex);
  world.executeCommands();
}

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

  // ---- ADD TRANSFORMCOMPONENT FIRST ----
  const cloneScale = { ...t.scale };
  const clonePos = { x: mouse.x, y: mouse.y, z: 0 };

  world.addComponent<TransformComponent>(newEntity, {
    type: 'TransformComponent',
    position: clonePos,
    scale: cloneScale,
    rotation: { ...t.rotation },
  });

  world.addComponent<PanelComponent>(newEntity, {
    type: 'PanelComponent',
    ...p,
  });

  if (m) world.addComponent<MaterialComponent>(newEntity, { type: 'MaterialComponent', ...m });

  const movementRule = d?.movementId || 'drag_xy';
  if (d) {
    world.addComponent<DragComponent>(newEntity, {
      type: 'DragComponent',
      ...d,
      parentNameId: targetParentName || d.parentNameId,
      movementId: movementRule,
      moveEdge: 'all',
    });
  } else {
    world.addComponent<DragComponent>(newEntity, {
      type: 'DragComponent',
      parentNameId: targetParentName,
      movementId: movementRule,
      moveEdge: 'all',
      minX: NaN,
      maxX: NaN,
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

  // Make it visible
  world.addTag(newEntity, 'Visible');

  // ---- COMMIT ALL COMMANDS BEFORE BUILDING ANYTHING ELSE ----
  world.executeCommands();

  // Verify the transform exists
  const check = world.getComponentByIndex<TransformComponent>(newEntity.index, 'TransformComponent');
  if (!check) {
    console.error('[CloneSystem] Failed to store TransformComponent!');
    return;
  }

  const uniqueName = `_box_${newEntity.index}`;
  panelEntities.set(uniqueName, newEntity);
  const areaFile = panelSourceFile.get(targetParentName) ?? 'PanelCore.csv';
  panelSourceFile.set(uniqueName, areaFile);

  // Build movement mailbox
  const entry: MovementGroupEntry = {
    entityId: newEntity.index,
    attachEdge: 'all',
    origLeft: clonePos.x - cloneScale.x / 2,
    origTop:  clonePos.y - cloneScale.y / 2,
    origWidth:  cloneScale.x,
    origHeight: cloneScale.y,
  };
  world.addComponent<MovementGroupComponent>(newEntity, {
    type: 'MovementGroup',
    parentMovementRule: movementRule,
    entries: [entry],
  });

  // Insert into layer buckets & spatial index
  const layer = p.layer;
  if (!layerBuckets.has(layer)) layerBuckets.set(layer, []);
  layerBuckets.get(layer)!.push(newEntity.index);
  updateSpatialIndex();

  // Start following the cursor
  world.addTag(newEntity, 'FollowCursorFlag');
  world.executeCommands();

  console.log(`[CloneSystem] Cloned ${templateName} → ${uniqueName}`);
}

function removeFlag(world: any, entityIndex: number) {
  const gen = world.generations[entityIndex];
  world.removeTag(new Entity(entityIndex, gen), 'CloneFlag');
}

function getPanelName(world: any, entityIndex: number): string | null {
  const map = (window as any).__panelEntitiesMap as Map<string, Entity>;
  if (!map) return null;
  for (const [n, e] of map) if (e.index === entityIndex) return n;
  return null;
}

registerSystemMethod('SETUE.Systems.CloneSystem', 'Load', Load);
registerSystemMethod('SETUE.Systems.CloneSystem', 'Update', Update);
