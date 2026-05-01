// Systems/PanelPopulator.ts
import { getWorld } from '../Core/GlobalWorld.js';
import { panelEntities } from '../Ui/Panel.js';
import { parseCsvArray } from '../parseCsv.js';
import { registerScript } from './ScriptRunner.js';
import {
  Entity,
  PanelComponent,
  MaterialComponent,
  TransformComponent,
  TextComponent,
  DragComponent,
  SelectableComponent,
} from '../Core/ECS.js';

let currentFieldEntities: Entity[] = [];

/**
 * Clears the right panel and populates it with a draggable token
 * for every field defined in the selected game system's fields CSV.
 */
export async function populateFields(systemName: string) {
  const world = getWorld();

  // Remove any previously generated field tokens
  currentFieldEntities.forEach(e => world.destroyEntity(e));
  currentFieldEntities = [];

  // Find the right panel entity
  const rightPanelEntity = panelEntities.get('right_panel');
  if (!rightPanelEntity) return;

  // Load GameSystems.csv to get the fields_csv for the selected system
  let fieldsCsvPath = '';
  try {
    const res = await fetch('Rule Systems/GameSystems.csv');
    const csvText = await res.text();
    const rows = parseCsvArray(csvText);
    const match = rows.find(r => r['game_system'] === systemName);
    if (match && match['fields_csv']) {
      fieldsCsvPath = match['fields_csv'];
    }
  } catch (e) {
    console.error('[PanelPopulator] Cannot read GameSystems.csv:', e);
    return;
  }

  if (!fieldsCsvPath) {
    console.warn(`[PanelPopulator] No fields_csv defined for "${systemName}"`);
    return;
  }

  // Fetch the field definitions
  let fieldNames: string[] = [];
  try {
    const res = await fetch(fieldsCsvPath);
    const csvText = await res.text();
    const rows = parseCsvArray(csvText);
    fieldNames = rows.map(r => r['field_name'] ?? '').filter(Boolean);
  } catch (e) {
    console.error(`[PanelPopulator] Cannot load ${fieldsCsvPath}:`, e);
    return;
  }

  // Create a small panel for each field name, stacked vertically on the right panel
  const startY = 40;
  const itemHeight = 24;
  const rightTransform = world.getComponent<TransformComponent>(rightPanelEntity, 'TransformComponent');
  if (!rightTransform) return;
  const parentX = rightTransform.position.x;
  const parentY = rightTransform.position.y;

  fieldNames.forEach((name, idx) => {
    const entity = world.createEntity();
    const yPos = parentY + startY + idx * itemHeight;

    world.addComponent<TransformComponent>(entity, {
      type: 'TransformComponent',
      position: { x: parentX, y: yPos, z: 0 },
      scale: { x: 180, y: itemHeight, z: 1 },
    });
    world.addComponent<PanelComponent>(entity, {
      type: 'PanelComponent',
      visible: true,
      layer: 15,
      clickable: false,
      alpha: 1,
    });
    world.addComponent<MaterialComponent>(entity, {
      type: 'MaterialComponent',
      color: { r: 0.3, g: 0.5, b: 0.8, a: 1 },
    });
    world.addComponent<TextComponent>(entity, {
      type: 'TextComponent',
      contentId: name,
      fontId: 'default',
      fontSize: 12,
      color: { r: 1, g: 1, b: 1, a: 1 },
      align: 'center',
      vAlign: 'middle',
    });
    world.addComponent<SelectableComponent>(entity, {
      type: 'SelectableComponent',
      clickable: true,
      visible: true,
      layer: 15,
    });
    world.addComponent<DragComponent>(entity, {
      type: 'DragComponent',
      parentNameId: 'right_panel',   // allows the token to be dragged out
      movementId: 'drag_xy',
      moveEdge: 'all',
    });

    panelEntities.set(`field_${name}`, entity);
    currentFieldEntities.push(entity);
  });
}

// Expose the function so it can be called from Actions.csv via runScript
registerScript('populate_sheet_fields', () => {
  // The selected game-system name will be supplied by the dropdown system
  // (wired in a later step). For now, you can call populateFields("SRD d20") manually.
});
