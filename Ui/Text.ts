// Ui/Text.ts
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { getColor } from './Color.js';
import { panelEntities } from './Panel.js';
import { Entity, TransformComponent, PanelComponent, TextComponent } from '../Core/ECS.js';

interface TextDef {
  id: string;
  panelId: string;
  content: string;
  fontId: string;
  color: { r: number; g: number; b: number; a: number };
  align: string;
  valign: string;
  layer: number;
  rotation: number;
  padLeft: number;
  padTop: number;
  lineHeight: number;
  entity: Entity;
}

const textDefs: TextDef[] = [];

// ---------------------------------------------------------------
//  LOAD – reads every Text*.csv and builds ECS entities
// ---------------------------------------------------------------
async function Load() {
  const world = getWorld();

  const textFiles = [
    'Ui/Texts/TextCore.csv',
    'Ui/Texts/TextSheets.csv',
    'Ui/Texts/TextSpellbook.csv',
    'Ui/Texts/TextBoard.csv',
    'Ui/Texts/TextSheetEditor.csv',
    'Ui/Texts/TextMapEditor.csv',
    'Ui/Texts/TextImageEditor.csv',
    'Ui/Texts/TextSystemEditor.csv',
  ];

  const responses = await Promise.all(textFiles.map(f => fetch(f)));
  const texts = await Promise.all(responses.map(r => r.text()));

  const allRows = texts
    .flatMap(t => parseCsvArray(t))
    .filter(row => row['id'] && !row['id'].startsWith('#'));

  console.log(`[Texts] Loaded ${textFiles.length} files, ${allRows.length} rows`);

  textDefs.length = 0;

  for (const row of allRows) {
    const content   = row['text']       ?? '';
    const fontId    = row['font_id']    ?? 'default';
    const colorId   = row['color_id'];
    const align     = row['align']      ?? 'left';
    const valign    = row['valign']     ?? 'top';
    const layer     = parseInt(row['layer'] ?? '0');
    const rotation  = parseFloat(row['rotation'] ?? '0');
    const padLeft   = parseFloat(row['pad_left'] ?? '0');
    const padTop    = parseFloat(row['pad_top'] ?? '0');
    const lineH     = parseFloat(row['line_height'] ?? '20');
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
      styleId: 0,
    });

    world.addComponent(entity, {
      type: 'TransformComponent',
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });

    textDefs.push({
      id: row['id'],
      panelId,
      content,
      fontId,
      color: { r: color.r, g: color.g, b: color.b, a: color.alpha },
      align,
      valign,
      layer,
      rotation,
      padLeft,
      padTop,
      lineHeight: lineH,
      entity,
    });
  }

  world.executeCommands();
  console.log('[Texts] All text entities created');
}

// ---------------------------------------------------------------
//  UPDATE – positions every text inside its parent panel
// ---------------------------------------------------------------
function computeStartY(
  region: { top: number; height: number },
  defs: TextDef[]
): number {
  const totalHeight = defs.reduce((sum, def) => sum + def.lineHeight, 0);
  const valign = defs[0]?.valign;

  switch (valign) {
    case 'middle':
      return region.top + (region.height - totalHeight) / 2;
    case 'bottom':
      // the padTop of the first text is used as bottom margin
      return region.top + region.height - totalHeight - (defs[0]?.padTop ?? 0);
    default: // 'top'
      return region.top + (defs[0]?.padTop ?? 0);
  }
}

function Update() {
  const world = getWorld();

  // Group texts by panelId (skip texts without a panel or whose panel is invisible)
  const grouped = new Map<string, TextDef[]>();
  for (const def of textDefs) {
    if (!def.panelId) continue;
    const panelEntity = panelEntities.get(def.panelId);
    if (!panelEntity) continue;
    const panel = world.getComponent<PanelComponent>(panelEntity, 'PanelComponent');
    if (!panel || !panel.visible) continue;
    const list = grouped.get(def.panelId) || [];
    list.push(def);
    grouped.set(def.panelId, list);
  }

  for (const [panelId, defs] of grouped) {
    const panelEntity = panelEntities.get(panelId)!;
    const panelTrans = world.getComponent<TransformComponent>(panelEntity, 'TransformComponent');
    if (!panelTrans) continue;

    const region = {
      top: panelTrans.position.y - panelTrans.scale.y * 0.5,
      height: panelTrans.scale.y,
      left: panelTrans.position.x - panelTrans.scale.x * 0.5,
      width: panelTrans.scale.x,
    };

    // Sort by layer (lowest first)
    defs.sort((a, b) => a.layer - b.layer);

    const startY = computeStartY(region, defs);
    let yCursor = startY;

    for (const def of defs) {
      const transform = world.getComponent<TransformComponent>(def.entity, 'TransformComponent');
      if (!transform) continue;

      // Horizontal position
      let x = region.left + def.padLeft;
      if (def.align === 'center') {
        x = region.left + region.width * 0.5;
      } else if (def.align === 'right') {
        x = region.left + region.width - def.padLeft;
      }

      // For vertical centering, we place the text at yCursor (top‑left of the line)
      transform.position = { x, y: yCursor, z: 0 };
      world.setComponent(def.entity, transform);

      yCursor += def.lineHeight;
    }
  }
}

// ---------------------------------------------------------------
//  HELPERS
// ---------------------------------------------------------------
export function rebuildTextDefs() {
  const world = getWorld();
  textDefs.length = 0;
  world.forEach2<TextComponent, TransformComponent>(
    'TextComponent',
    'TransformComponent',
    (entity, textComp) => {
      textDefs.push({
        id: String(entity.index),
        panelId: textComp.panelId as string,
        content: textComp.contentId as string,
        fontId: textComp.fontId as string,
        color: textComp.color,
        align: textComp.align as string,
        valign: textComp.vAlign as string,
        layer: textComp.layer,
        rotation: textComp.rotation,
        padLeft: textComp.padLeft,
        padTop: textComp.padTop,
        lineHeight: textComp.lineHeight,
        entity: entity,
      });
    }
  );
}

registerSystemMethod('SETUE.Systems.Texts', 'Load', Load);
registerSystemMethod('SETUE.Systems.Texts', 'Update', Update);
