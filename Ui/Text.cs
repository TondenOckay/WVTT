import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { getColor } from './Color.js';

function Load() {
  const world = getWorld();

  fetch('Ui/Text.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text) as any[];

      for (const row of rows) {
        if (!row['id']) continue;

        const content   = row['text']       ?? '';
        const fontId    = row['font_id']    ?? 'default';
        const colorId   = row['color_id'];
        const align     = row['align']      ?? 'left';
        const valign    = row['valign']     ?? 'top';
        const layer     = parseInt(row['layer'] ?? '0');
        const rotation  = parseFloat(row['rotation'] ?? '0');
        const padLeft   = parseFloat(row['pad_left'] ?? '0');
        const padTop    = parseFloat(row['pad_top'] ?? '0');
        const lineH      = parseFloat(row['line_height'] ?? '20');
        const panelId   = row['panel_id'] ?? '';

        const color = colorId ? getColor(colorId) : { r: 1, g: 1, b: 1, a: 1 };

        const entity = world.createEntity();

        world.addComponent(entity, {
          type: 'TextComponent',
          id: 0,
          contentId: content,
          fontId,
          fontSize: 16,
          color: { r: color.r, g: color.g, b: color.b, a: color.alpha },
          align,
          rotation,
          layer,
          source: 0,
          prefix: '',
          panelId,
          padLeft,
          padTop,
          lineHeight: lineH,
          vAlign: valign,
          styleId: 0
        });

        world.addComponent(entity, {
          type: 'TransformComponent',
          position: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 }
        });
      }

      world.executeCommands();
      console.log(`[Texts] Loaded text entities`);
    });
}

function Update() {
  // Future: position text relative to panels (like C# Update)
}

registerSystemMethod('SETUE.Systems.Texts', 'Load', Load);
registerSystemMethod('SETUE.Systems.Texts', 'Update', Update);
