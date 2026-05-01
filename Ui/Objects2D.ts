// Ui/Objects2D.ts
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { panelEntities, panelSourceFile } from './Panel.js';
import { parseCsvArray } from '../parseCsv.js';
import {
  TransformComponent,
  DragComponent,
  SelectableComponent,
  ImageComponent,
  ObjectTypeComponent,
  ScriptedActionsComponent,
  Entity,
} from '../Core/ECS.js';
import { runScript } from '../Systems/ScriptRunner.js';

export interface Object2DTemplate {
  objectType: string;
  templatePanel: string;
  defaultX: number;
  defaultY: number;
  defaultW: number;
  defaultH: number;
  layer: number;
  clickable: boolean;
  movementRule: string;
  scriptOnCreate: string;
  scriptOnSelect: string;
  scriptOnDeselect: string;
  scriptOnDelete: string;
  saveFormat: string;
}

const templates = new Map<string, Object2DTemplate>();

async function Load() {
  const response = await fetch('Ui/Objects2D.csv');
  const text = await response.text();
  const rows = parseCsvArray(text);

  for (const row of rows) {
    const objectType = row['object_type'];
    if (!objectType) continue;

    templates.set(objectType, {
      objectType,
      templatePanel: row['template_panel'] ?? '',
      defaultX: parseFloat(row['default_x'] ?? '0'),
      defaultY: parseFloat(row['default_y'] ?? '0'),
      defaultW: parseFloat(row['default_w'] ?? '0'),
      defaultH: parseFloat(row['default_h'] ?? '0'),
      layer: parseInt(row['layer'] ?? '9'),
      clickable: row['clickable'] !== 'false',
      movementRule: row['movement_rule'] ?? 'drag_xy',
      scriptOnCreate: row['script_on_create'] ?? '',
      scriptOnSelect: row['script_on_select'] ?? '',
      scriptOnDeselect: row['script_on_deselect'] ?? '',
      scriptOnDelete: row['script_on_delete'] ?? '',
      saveFormat: row['save_format'] ?? 'base64',
    });
  }

  console.log(`[Objects2D] Loaded ${templates.size} object templates`);
}

export function getTemplate(objectType: string): Object2DTemplate | undefined {
  return templates.get(objectType);
}

export function createObject(
  objectType: string,
  overrides?: {
    x?: number; y?: number; w?: number; h?: number;
    base64?: string;
    parentAreaName?: string;
  }
): Entity | null {
  const world = getWorld();
  const template = templates.get(objectType);
  if (!template) {
    console.warn(`[Objects2D] No template for "${objectType}"`);
    return null;
  }

  const templateEntity = panelEntities.get(template.templatePanel);
  if (!templateEntity) {
    console.warn(`[Objects2D] Template panel "${template.templatePanel}" not found`);
    return null;
  }

  const newEntity = world.createEntity();

  const compTypes = ['TransformComponent', 'DragComponent'];
  for (const compType of compTypes) {
    const comp = world.getComponent(templateEntity, compType);
    if (comp) {
      world.addComponent(newEntity, { type: compType, ...comp });
    }
  }

  const transform = world.getComponent(templateEntity, 'TransformComponent');
  if (transform) {
    world.addComponent<TransformComponent>(newEntity, {
      type: 'TransformComponent',
      position: {
        x: overrides?.x ?? template.defaultX,
        y: overrides?.y ?? template.defaultY,
        z: transform.position.z,
      },
      scale: {
        x: overrides?.w ?? template.defaultW,
        y: overrides?.h ?? template.defaultH,
        z: transform.scale.z,
      },
      rotation: { ...transform.rotation },
    });
  }

  const dragComp = world.getComponent(templateEntity, 'DragComponent');
  if (dragComp) {
    world.addComponent<DragComponent>(newEntity, {
      type: 'DragComponent',
      ...dragComp,
      movementId: template.movementRule,
    });
  }

  world.addComponent<SelectableComponent>(newEntity, {
    type: 'SelectableComponent',
    clickable: template.clickable,
    visible: true,
    layer: template.layer,
  });

  world.addComponent<ObjectTypeComponent>(newEntity, {
    type: 'ObjectTypeComponent',
    objectType,
  });

  if (overrides?.base64) {
    world.addComponent<ImageComponent>(newEntity, {
      type: 'ImageComponent',
      base64: overrides.base64,
      width: overrides.w ?? template.defaultW,
      height: overrides.h ?? template.defaultH,
      sprite: undefined,
    });
  }

  const leftClick = template.movementRule ? 'begin_drag' : undefined;
  const rightClick = template.scriptOnDelete ? 'delete_entity' : undefined;
  if (leftClick || rightClick) {
    world.addComponent<ScriptedActionsComponent>(newEntity, {
      type: 'ScriptedActionsComponent',
      leftClickScript: leftClick,
      rightClickScript: rightClick,
    });
  }

  const parentAreaName = overrides?.parentAreaName ?? 'image_editor_area';
  const uniqueName = `_${objectType}_${newEntity.index}`;
  panelEntities.set(uniqueName, newEntity);

  const areaFile = panelSourceFile.get(parentAreaName) ?? 'PanelCore.csv';
  panelSourceFile.set(uniqueName, areaFile);

  world.executeCommands();

  if (template.scriptOnCreate) {
    runScript(template.scriptOnCreate);
  }

  console.log(`[Objects2D] Created ${uniqueName} (type: ${objectType})`);
  return newEntity;
}

registerSystemMethod('SETUE.Systems.Objects2D', 'Load', Load);
