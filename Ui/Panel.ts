// Ui/Panel.ts
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { getColor } from './Color.js';
import { parseCsvArray } from '../parseCsv.js';
import { TransformComponent, PanelComponent, MaterialComponent, DragComponent, SelectableComponent, Entity } from '../Core/ECS.js';

export const panelRegions = new Map<string, { x: number; y: number; width: number; height: number }>();
export const panelEntities = new Map<string, Entity>();
export const panelSourceFile = new Map<string, string>();

async function Load() {
  const world = getWorld();

  const panelFiles = [
    'Ui/Panels/PanelCore.csv',
    'Ui/Panels/PanelSheets.csv',
    'Ui/Panels/PanelSpellbook.csv',
    'Ui/Panels/PanelBoard.csv',
    'Ui/Panels/PanelSheetEditor.csv',
    'Ui/Panels/PanelMapEditor.csv',
    'Ui/Panels/PanelImageEditor.csv',
    'Ui/Panels/PanelSystemEditor.csv',
  ];

  const responses = await Promise.all(panelFiles.map(f => fetch(f)));
  const texts = await Promise.all(responses.map(r => r.text()));

  let grandTotal = 0;

  for (let i = 0; i < panelFiles.length; i++) {
    const filePath = panelFiles[i];
    const fileName = filePath.split('/').pop()!;
    const rows = parseCsvArray(texts[i]);
    console.log(`[Panels] ${fileName} → ${rows.length} rows`);

    for (const row of rows) {
      const objName = row['object_name'];
      if (!objName || objName.startsWith('#')) continue;

      grandTotal++;
      panelSourceFile.set(objName, fileName);

      const left   = parseFloat(row['left'] ?? '0');
      const right  = parseFloat(row['right'] ?? '0');
      const top    = parseFloat(row['top'] ?? '0');
      const bottom = parseFloat(row['bottom'] ?? '0');
      const width  = right - left;
      const height = bottom - top;

      panelRegions.set(objName, { x: left, y: top, width, height });

      const entity = world.createEntity();
      panelEntities.set(objName, entity);

      // --- Transform ---
      world.addComponent<TransformComponent>(entity, {
        type: 'TransformComponent',
        position: { x: left + width / 2, y: top + height / 2, z: 0 },
        scale: { x: width, y: height, z: 1 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      });

      // --- Panel (visual) ---
      const visible = row['visible']?.toLowerCase() !== 'false';
      const layer = parseInt(row['layer'] ?? '0');
      const clickable = row['clickable']?.toLowerCase() === 'true';

      world.addComponent<PanelComponent>(entity, {
        type: 'PanelComponent',
        id: 0,
        textId: 0,
        visible,
        layer,
        alpha: parseFloat(row['alpha'] ?? '1'),
        clickable,
        clipChildren: row['clip_children']?.toLowerCase() === 'true',
      });

      // --- Selectable (interaction) ---
      world.addComponent<SelectableComponent>(entity, {
        type: 'SelectableComponent',
        visible,
        layer,
        clickable,
      });

      // --- Material (colour) ---
      const color = getColor(row['color_id']);
      world.addComponent<MaterialComponent>(entity, {
        type: 'MaterialComponent',
        color: { r: color.r, g: color.g, b: color.b, a: color.alpha },
        pipelineId: 0,
      });

      // --- Drag (movement) ---
      const parentName = row['parent_name'] ?? '';
      const moveEdge   = row['move_edge'] ?? '';
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
          maxX: isNaN(maxX) ? NaN : maxX,
        });
      }
    }
  }

  world.executeCommands();
  console.log(`[Panels] Grand total: ${grandTotal} entities, source map size ${panelSourceFile.size}`);
  console.log(`[Panels] 'sheet_area' in source map? ${panelSourceFile.has('sheet_area')}`);
}

export function clearPanelData() {
  panelRegions.clear();
  panelEntities.clear();
  panelSourceFile.clear();
}

registerSystemMethod('SETUE.Systems.Panels', 'Load', Load);
