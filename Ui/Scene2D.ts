import * as PIXI from 'pixi.js';
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Window } from '../Window.js';
import { panelRegions, panelEntities } from './Panel.js';
import type {
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  TextComponent
} from '../Core/ECS.js';

let rules: { id: string; enabled: boolean; order: number; dataSource: string; useScissor: boolean }[] = [];
const panelSprites = new Map<number, PIXI.Container>();
const textSprites   = new Map<number, PIXI.Text>();

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
          useScissor: r['use_scissor']?.toLowerCase() === 'true'
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

  const world = getWorld();
  world.executeCommands();

  for (const rule of rules) {
    // -------- PANELS --------
    if (rule.dataSource === 'panels') {
      world.forEach2<TransformComponent, PanelComponent>(
        'TransformComponent',
        'PanelComponent',
        (e, transform, panel) => {
          let container = panelSprites.get(e.index);

          if (!panel.visible) {
            // Hide container if it exists
            if (container) container.visible = false;
            return;
          }

          // Ensure container exists and is visible
          if (!container) {
            container = new PIXI.Container();
            container.label = `panel_${e.index}`;
            stage.addChild(container);

            const material = world.getComponent<MaterialComponent>(e, 'MaterialComponent');
            const hex = material
              ? toHexColor(material.color.r, material.color.g, material.color.b)
              : 0x333333;
            const bg = new PIXI.Graphics();
            bg.fill({ color: hex, alpha: material?.color.a ?? 1 });
            bg.rect(0, 0, transform.scale.x, transform.scale.y);
            bg.fill();
            container.addChild(bg);

            if (panel.clipChildren) {
              const mask = new PIXI.Graphics();
              mask.fill({ color: 0xffffff });
              mask.rect(0, 0, transform.scale.x, transform.scale.y);
              mask.fill();
              container.mask = mask;
              container.addChild(mask);
            }

            panelSprites.set(e.index, container);
          }

          container.visible = true;
          container.x = transform.position.x - transform.scale.x / 2;
          container.y = transform.position.y - transform.scale.y / 2;
          container.zIndex = panel.layer;
          container.alpha = panel.alpha;
        }
      );
    }

    // -------- TEXTS --------
    if (rule.dataSource === 'texts') {
      world.forEach2<TextComponent, TransformComponent>(
        'TextComponent',
        'TransformComponent',
        (e, textComp, transform) => {
          // If text has a panel, only show it when that panel is visible
          if (textComp.panelId) {
            const panelEntity = panelEntities.get(textComp.panelId as string);
            if (panelEntity) {
              const panel = world.getComponent<PanelComponent>(panelEntity, 'PanelComponent');
              if (panel && !panel.visible) {
                // Hide text sprite if it exists
                const txt = textSprites.get(e.index);
                if (txt) txt.visible = false;
                return;
              }
            }
          }

          let txt = textSprites.get(e.index);
          if (!txt) {
            const fillColor = toHexColor(textComp.color.r, textComp.color.g, textComp.color.b);
            txt = new PIXI.Text({
              text: textComp.contentId as string,
              style: {
                fontFamily: 'Arial, sans-serif',
                fontSize: textComp.fontSize ?? 16,
                fill: fillColor,
                align: textComp.align as any,
              }
            });
            txt.label = `text_${e.index}`;
            stage.addChild(txt);
            textSprites.set(e.index, txt);
          } else {
            txt.visible = true;
            if (txt.text !== textComp.contentId) {
              txt.text = textComp.contentId as string;
            }
          }

          txt.x = transform.position.x;
          txt.y = transform.position.y;
          txt.alpha = textComp.color.a;
          txt.zIndex = textComp.layer;
          txt.rotation = (textComp.rotation ?? 0) * Math.PI / 180;
          if (Math.abs(textComp.rotation ?? 0) === 90 || Math.abs(textComp.rotation ?? 0) === 270) {
            txt.anchor.set(0.5);
          } else {
            txt.anchor.set(0, 0);
          }
        }
      );
    }
  }
}

registerSystemMethod('SETUE.Scene.Scene2D', 'Load', Load);
registerSystemMethod('SETUE.Scene.Scene2D', 'Update', Update);
