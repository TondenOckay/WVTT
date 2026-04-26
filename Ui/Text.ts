import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { getColor } from './Color.js';
import { panelRegions } from './Panel.js';
import { getFont } from './Font.js';
import { Entity, TransformComponent } from '../Core/ECS.js';

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

function Load() {
  const world = getWorld();

  return fetch('Ui/Text.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text) as any[];
      textDefs.length = 0;

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
          styleId: 0
        });

        world.addComponent(entity, {
          type: 'TransformComponent',
          position: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: { x: 0, y: 0, z: 0, w: 1 }
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
      console.log(`[Texts] Loaded text entities`);
    });
}

function getFontMetrics(fontId: string): { ascent: number; descent: number } {
  const font = getFont(fontId);
  if (font) return { ascent: font.ascent, descent: font.descent };
  return { ascent: 12, descent: 4 };
}

function Update() {
  const world = getWorld();

  // Group texts by panelId (skip those without a panel or with missing region)
  const grouped = new Map<string, TextDef[]>();
  for (const def of textDefs) {
    if (!def.panelId) continue;
    if (!panelRegions.has(def.panelId)) continue;
    const list = grouped.get(def.panelId) || [];
    list.push(def);
    grouped.set(def.panelId, list);
  }

  for (const [panelId, defs] of grouped) {
    const region = panelRegions.get(panelId)!;
    defs.sort((a, b) => a.layer - b.layer);

    const firstDef = defs[0];
    const isVertical = Math.abs(firstDef.rotation) === 90 || Math.abs(firstDef.rotation) === 270;

    // --- Compute visual block height (exactly like C#) ---
    let visualTop = 0, visualBottom = 0;
    let currentBaselineOffset = 0;
    let firstLine = true;

    for (const def of defs) {
      const { ascent, descent } = getFontMetrics(def.fontId);

      if (isVertical) {
        // Measure string width using glyph data if available
        let stringWidth = 0;
        const font = getFont(def.fontId);
        if (font) {
          for (const ch of def.content) {
            const g = font.glyphs.get(ch);
            if (g) stringWidth += g.advanceX;
          }
        } else {
          stringWidth = def.content.length * 10; // fallback
        }

        if (firstLine) {
          visualTop = -stringWidth * 0.5;
          visualBottom = stringWidth * 0.5;
          firstLine = false;
        } else {
          currentBaselineOffset += def.lineHeight;
          const lineTop = currentBaselineOffset - stringWidth * 0.5;
          const lineBottom = currentBaselineOffset + stringWidth * 0.5;
          if (lineTop < visualTop) visualTop = lineTop;
          if (lineBottom > visualBottom) visualBottom = lineBottom;
        }
      } else {
        if (firstLine) {
          visualTop = -ascent;
          visualBottom = descent;
          firstLine = false;
        } else {
          currentBaselineOffset += def.lineHeight;
          const lineTop = currentBaselineOffset - ascent;
          const lineBottom = currentBaselineOffset + descent;
          if (lineTop < visualTop) visualTop = lineTop;
          if (lineBottom > visualBottom) visualBottom = lineBottom;
        }
      }
    }

    const visualHeight = visualBottom - visualTop;

    // --- Vertical block positioning ---
    let startY: number;
    if (firstDef.valign === 'middle') {
      const blockTop = region.y + (region.height - visualHeight) * 0.5;
      startY = blockTop - visualTop;
    } else if (firstDef.valign === 'bottom') {
      const blockTop = region.y + region.height - visualHeight - firstDef.padTop;
      startY = blockTop - visualTop;
    } else { // top
      startY = region.y + firstDef.padTop - visualTop;
    }

    // --- Position each line ---
    currentBaselineOffset = 0;
    for (const def of defs) {
      const transform = world.getComponent<TransformComponent>(def.entity, 'TransformComponent');
      if (!transform) continue;

      // Horizontal position (identical for vertical and horizontal)
      let x = region.x + def.padLeft;
      if (def.align === 'center') {
        x = region.x + region.width * 0.5;
      } else if (def.align === 'right') {
        x = region.x + region.width - def.padLeft;
      }

      // Baseline y for this line
      const baselineY = startY + currentBaselineOffset;

      // Convert to top‑left (PIXI.Text origin) for horizontal texts
      const { ascent } = getFontMetrics(def.fontId);
      const topLeftY = baselineY - ascent;

      if (isVertical) {
        // Place text's center at the panel center (like C# did)
        transform.position = {
          x: region.x + region.width * 0.5,
          y: region.y + region.height * 0.5,
          z: 0
        };
      } else {
        transform.position = { x, y: topLeftY, z: 0 };
      }

      world.setComponent(def.entity, transform);
      currentBaselineOffset += def.lineHeight;
    }
  }
}

registerSystemMethod('SETUE.Systems.Texts', 'Load', Load);
registerSystemMethod('SETUE.Systems.Texts', 'Update', Update);
