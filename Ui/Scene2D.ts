// Ui/Scene2D.ts
import * as PIXI from 'pixi.js';
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Window } from '../Window.js';
import { panelEntities } from './Panel.js';
import type {
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  TextComponent,
} from '../Core/ECS.js';

let rules: { id: string; enabled: boolean; order: number; dataSource: string; useScissor: boolean }[] = [];
const panelSprites = new Map<number, PIXI.Container>();
const textSprites   = new Map<number, PIXI.Text>();
const lastScaleX = new Map<number, number>();
const lastScaleY = new Map<number, number>();
const lastColorHex = new Map<number, number>();

function Load() {
  fetch('Ui/Scene2D.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text);
      rules = rows
        .filter(r => r['enabled']?.toLowerCase() === 'true')
        .map(r => ({
          id: r['id'],
          enabled: true,
          order: parseInt(r['order'] ?? '0'),
          dataSource: r['data_source'],
          useScissor: r['use_scissor']?.toLowerCase() === 'true',
        }))
        .sort((a, b) => a.order - b.order);
      console.log(`[Scene2D] Loaded ${rules.length} rules`);
    });
}

function toHexColor(r: number, g: number, b: number): number {
  return ((Math.round(r * 255) & 0xff) << 16) |
         ((Math.round(g * 255) & 0xff) << 8)  |
         (Math.round(b * 255) & 0xff);
}

function Update() {
  const stage = Window.app?.stage;
  if (!stage) return;

  stage.sortableChildren = true;

  const world = getWorld();
  world.executeCommands();

  for (const rule of rules) {
    // -------- PANELS --------
    if (rule.dataSource === 'panels') {
      world.forEachIndex2<TransformComponent, PanelComponent>(
        'TransformComponent',
        'PanelComponent',
        (idx, transform, panel) => {
          let container = panelSprites.get(idx);
          if (!panel.visible) {
            if (container) container.visible = false;
            return;
          }

          const w = transform.scale.x;
          const h = transform.scale.y;

          // Fixed line: use getComponentByIndex to avoid allocation and incorrect generation
          const material = world.getComponentByIndex<MaterialComponent>(idx, 'MaterialComponent');
          const hex = material
            ? toHexColor(material.color.r, material.color.g, material.color.b)
            : 0x333333;
          const alpha = material?.color.a ?? 1;

          if (!container) {
            container = new PIXI.Container();
            container.label = `panel_${idx}`;
            container.eventMode = 'static';
            container.on('pointerdown', (e) => {
              (Window as any).__deselectImageEditor?.();
              e.stopPropagation();
            });

            stage.addChild(container);

            const bg = new PIXI.Graphics();
            bg.fill({ color: hex, alpha });
            bg.rect(0, 0, w, h);
            bg.fill();
            container.addChild(bg);
            (container as any).__bg = bg;

            if (panel.clipChildren) {
              const mask = new PIXI.Graphics();
              mask.fill({ color: 0xffffff });
              mask.rect(0, 0, w, h);
              mask.fill();
              container.mask = mask;
              container.addChild(mask);
            }

            panelSprites.set(idx, container);
            lastScaleX.set(idx, w);
            lastScaleY.set(idx, h);
            lastColorHex.set(idx, hex);
          } else {
            container.visible = true;
            const prevW = lastScaleX.get(idx) ?? w;
            const prevH = lastScaleY.get(idx) ?? h;
            const prevHex = lastColorHex.get(idx);

            if (prevW !== w || prevH !== h || prevHex !== hex) {
              const bg = (container as any).__bg as PIXI.Graphics | undefined;
              if (bg) {
                bg.clear();
                bg.fill({ color: hex, alpha });
                bg.rect(0, 0, w, h);
                bg.fill();
              }
              lastScaleX.set(idx, w);
              lastScaleY.set(idx, h);
              lastColorHex.set(idx, hex);
            }
          }

          container.x = transform.position.x - w / 2;
          container.y = transform.position.y - h / 2;
          container.zIndex = panel.layer;
          container.alpha = panel.alpha;
        }
      );
    }

    // -------- TEXTS --------
    if (rule.dataSource === 'texts') {
      world.forEachIndex2<TextComponent, TransformComponent>(
        'TextComponent',
        'TransformComponent',
        (idx, textComp, transform) => {
          let panelVisible = true;
          if (textComp.panelId) {
            const panelEntity = panelEntities.get(textComp.panelId as string);
            if (panelEntity) {
              const panel = world.getComponent<PanelComponent>(panelEntity, 'PanelComponent');
              if (panel && !panel.visible) panelVisible = false;
            }
          }

          let txt = textSprites.get(idx);
          if (!txt) {
            const fillColor = toHexColor(textComp.color.r, textComp.color.g, textComp.color.b);
            txt = new PIXI.Text({
              text: textComp.contentId as string,
              style: {
                fontFamily: 'Arial, sans-serif',
                fontSize: textComp.fontSize ?? 16,
                fill: fillColor,
                align: textComp.align as any,
              },
            });
            txt.label = `text_${idx}`;
            stage.addChild(txt);
            textSprites.set(idx, txt);
          }

          txt.visible = panelVisible && textComp.contentId !== '';
          if (txt.visible) {
            txt.x = transform.position.x;
            txt.y = transform.position.y;
            txt.alpha = textComp.color.a;
            txt.zIndex = textComp.layer;
            txt.rotation = (textComp.rotation ?? 0) * Math.PI / 180;

            const isVertical = Math.abs(textComp.rotation ?? 0) === 90 || Math.abs(textComp.rotation ?? 0) === 270;
            if (isVertical) {
              txt.anchor.set(0.5);
            } else {
              const align = textComp.align;
              if (align === 'center') {
                txt.anchor.set(0.5, 0);
              } else if (align === 'right') {
                txt.anchor.set(1, 0);
              } else {
                txt.anchor.set(0, 0);
              }
            }
          }
        }
      );
    }
  }
}

export function resetDisplay() {
  const stage = Window.app?.stage;
  if (!stage) return;

  for (const container of panelSprites.values()) {
    if (container.parent) container.removeFromParent();
  }
  panelSprites.clear();
  lastScaleX.clear();
  lastScaleY.clear();
  lastColorHex.clear();

  for (const txt of textSprites.values()) {
    if (txt.parent) txt.removeFromParent();
  }
  textSprites.clear();
}

registerSystemMethod('SETUE.Scene.Scene2D', 'Load', Load);
registerSystemMethod('SETUE.Scene.Scene2D', 'Update', Update);
