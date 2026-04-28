// Systems/Actions.ts
import { registerScript } from './ScriptRunner.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { panelEntities } from '../Ui/Panel.js';
import { parseCsvArray } from '../parseCsv.js';
import {
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  DragComponent,
  SelectableComponent,
  Entity,
} from '../Core/ECS.js';

async function loadActions() {
  const response = await fetch('Systems/Actions.csv');
  const text = await response.text();
  const rows = parseCsvArray(text);

  for (const row of rows) {
    const actionId = row['action_id'];
    const operation = row['operation'];
    if (!actionId || !operation) continue;

    registerScript(actionId, () => {
      runOperation(operation, row);
    });
  }
  console.log(`[Actions] Registered ${rows.length} actions`);
}

function runOperation(operation: string, row: Record<string, string>) {
  const world = getWorld();

  switch (operation) {
    case 'clone_entity':
      cloneEntity(row['template'], row['target_parent']);
      break;
    // future operations go here
  }
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
  world.addComponent<TransformComponent>(newEntity, {
    type: 'TransformComponent',
    position: { x: 300 + Math.random() * 200, y: 100 + Math.random() * 100, z: 0 },
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
    });
  }
  world.addComponent<SelectableComponent>(newEntity, {
    type: 'SelectableComponent',
    clickable: true,
    visible: true,
    layer: p.layer,
  });
  world.executeCommands();
  console.log(`[Actions] Cloned ${templateName} → entity ${newEntity.index}`);
}

loadActions();
