// Ui/Panel.ts
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { getColor } from './Color.js';
import { TransformComponent, PanelComponent, MaterialComponent, DragComponent, Entity } from '../Core/ECS.js';

export const panelRegions = new Map<string, { x: number; y: number; width: number; height: number }>();
export const panelEntities = new Map<string, Entity>();

function Load() {
  const world = getWorld();
  return fetch('Ui/Panel.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text) as any[];
      for (const row of rows) {
        if (!row['object_name']) continue;
        const left   = parseFloat(row['left'] ?? '0');
        const right  = parseFloat(row['right'] ?? '0');
        const top    = parseFloat(row['top'] ?? '0');
        const bottom = parseFloat(row['bottom'] ?? '0');
        const width  = right - left;
        const height = bottom - top;

        panelRegions.set(row['object_name'], { x: left, y: top, width, height });

        const entity = world.createEntity();
        panelEntities.set(row['object_name'], entity);

        world.addComponent<TransformComponent>(entity, {
          type: 'TransformComponent',
          position: { x: left + width / 2, y: top + height / 2, z: 0 },
          scale: { x: width, y: height, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 }
        });

        world.addComponent<PanelComponent>(entity, {
          type: 'PanelComponent',
          id: 0,
          textId: 0,
          visible: row['visible']?.toLowerCase() !== 'false',
          layer: parseInt(row['layer'] ?? '0'),
          alpha: parseFloat(row['alpha'] ?? '1'),
          clickable: row['clickable']?.toLowerCase() === 'true',
          clipChildren: row['clip_children']?.toLowerCase() === 'true'
        });

        const colorId = row['color_id'];
        const color = getColor(colorId);
        world.addComponent<MaterialComponent>(entity, {
          type: 'MaterialComponent',
          color: { r: color.r, g: color.g, b: color.b, a: color.alpha },
          pipelineId: 0
        });

        const parentName = row['parent_name'] ?? '';
        const moveEdge = row['move_edge'] ?? '';
        const callScript = row['call_script'] ?? '';
        const minX = parseFloat(row['min_x'] ?? 'NaN');
        const maxX = parseFloat(row['max_x'] ?? 'NaN');

        if (parentName || moveEdge || callScript) {
          world.addComponent(entity, {
            type: 'DragComponent',
            parentNameId: parentName,
            movementId: callScript,
            moveEdge: moveEdge,
            minX: isNaN(minX) ? NaN : minX,
            maxX: isNaN(maxX) ? NaN : maxX
          });
        }
      }
      world.executeCommands();
      console.log(`[Panels] Created ECS entities for panels`);
    });
}

registerSystemMethod('SETUE.Systems.Panels', 'Load', Load);
