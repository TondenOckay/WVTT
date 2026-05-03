// Ui/Text.ts – loads text entities, computes final position from parent panel at boot
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { parseCsvArray } from '../parseCsv.js';
import {
  TransformComponent,
  TextComponent,
  PanelComponent,
} from '../Core/ECS.js';
import { PanelNameToIndex } from './Panel.js';

async function Load() {
  const world = getWorld();

  const textFiles = [
    'Ui/Texts/TextCore.csv',
    'Ui/Texts/TextBoard.csv',
    'Ui/Texts/TextSheets.csv',
    'Ui/Texts/TextSpellbook.csv',
    'Ui/Texts/TextSheetEditor.csv',
    'Ui/Texts/TextMapEditor.csv',
    'Ui/Texts/TextImageEditor.csv',
    'Ui/Texts/TextSystemEditor.csv',
  ];

  const responses = await Promise.all(textFiles.map(f => fetch(f)));
  const texts = await Promise.all(responses.map(r => r.text()));

  let total = 0, missingPanel = 0;

  for (let i = 0; i < textFiles.length; i++) {
    const rows = parseCsvArray(texts[i]);
    for (const row of rows) {
      const id = row['id'];
      if (!id || id.startsWith('#')) continue;

      const panelName = row['panel_id'] ?? '';
      const textContent = row['text'] ?? '';

      let panelIndex = -1;
      let panelLayer = 0;
      let panelTransform: TransformComponent | undefined;

      if (panelName) {
        const idx = PanelNameToIndex.get(panelName);
        if (idx !== undefined) {
          panelIndex = idx;
          const pComp = world.getComponentByIndex<PanelComponent>(idx, 'PanelComponent');
          if (pComp) panelLayer = pComp.layer;
          panelTransform = world.getComponentByIndex<TransformComponent>(idx, 'TransformComponent');
        } else {
          missingPanel++;
          console.warn(`[Text] panel_id "${panelName}" not found for text "${id}"`);
        }
      }

      // ----- Compute absolute position from parent panel + offsets -----
      let finalX = 0;
      let finalY = 0;
      let finalZIndex = parseInt(row['layer'] ?? '0') || 0;

      if (panelTransform) {
        const pw = panelTransform.scale.x;
        const ph = panelTransform.scale.y;
        const padLeft = parseFloat(row['pad_left'] ?? '0');
        const padTop  = parseFloat(row['pad_top'] ?? '0');
        const align   = (row['align'] ?? 'left').toLowerCase();
        const vAlign  = (row['valign'] ?? 'top').toLowerCase();

        // horizontal alignment + padding
        switch (align) {
          case 'center': finalX = panelTransform.position.x; break;
          case 'right':  finalX = panelTransform.position.x + pw / 2 - padLeft; break;
          default:       finalX = panelTransform.position.x - pw / 2 + padLeft; break;
        }

        // vertical alignment + padding
        switch (vAlign) {
          case 'middle': finalY = panelTransform.position.y + padTop; break;
          case 'bottom': finalY = panelTransform.position.y + ph / 2 - padTop; break;
          default:       finalY = panelTransform.position.y - ph / 2 + padTop; break;
        }

        // If no explicit layer, place text just above its panel
        if (finalZIndex === 0) finalZIndex = panelLayer + 1;
      } else {
        if (finalZIndex === 0) finalZIndex = 999;   // fallback for texts without a panel
      }

      const entity = world.createEntity();

      world.addComponent<TextComponent>(entity, {
        type: 'TextComponent',
        id: 0,
        contentId: textContent,
        fontId: row['font_id'] ?? 'default',
        fontSize: parseFloat(row['font_size'] ?? '16'),
        color: { r: 1, g: 1, b: 1, a: 1 },        // white; your CSV may define color later
        align: row['align'] ?? 'left',
        rotation: parseFloat(row['rotation'] ?? '0'),
        layer: finalZIndex,
        source: 0,
        prefix: row['prefix'] ?? '',
        panelId: panelName,
        panelIndex,
        padLeft: parseFloat(row['pad_left'] ?? '0'),
        padTop: parseFloat(row['pad_top'] ?? '0'),
        lineHeight: parseFloat(row['line_height'] ?? '0'),
        vAlign: row['valign'] ?? 'top',
        styleId: 0,
      });

      world.addComponent<TransformComponent>(entity, {
        type: 'TransformComponent',
        position: { x: finalX, y: finalY, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      });

      world.addTag(entity, 'Visible');
      total++;
    }
  }

  world.executeCommands();
  console.log(`[Text] Loaded ${total} text entities (${missingPanel} missing parent panels)`);
}

registerSystemMethod('SETUE.Systems.Texts', 'Load', Load);
