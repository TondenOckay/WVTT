// Ui/Scene2D.ts – draws panels (tags + static styles), text (anchor‑aware), clip‑child masks
import * as PIXI from 'pixi.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { styleArray, layerBuckets } from './Panel.js';
import { Window } from '../Window.js';
import {
  TransformComponent,
  PanelComponent,
  TextComponent,
  Entity,
} from '../Core/ECS.js';

let stage: PIXI.Container | null = null;
const panelSprites = new Map<number, PIXI.Container>();
const textSprites   = new Map<number, PIXI.Text>();
const lastScaleX    = new Map<number, number>();
const lastScaleY    = new Map<number, number>();
const lastColorHex  = new Map<number, number>();

function toHexColor(r: number, g: number, b: number): number {
  return ((Math.round(r * 255) & 0xff) << 16) |
         ((Math.round(g * 255) & 0xff) << 8)  |
         (Math.round(b * 255) & 0xff);
}

function Update() {
  const world = getWorld();
  world.executeCommands();

  const app = Window.app;
  if (!app || !app.stage) return;
  stage = app.stage;
  stage.sortableChildren = true;

  const sortedLayers = [...layerBuckets.keys()].sort((a, b) => a - b);

  // ========== PANELS ==========
  for (const layer of sortedLayers) {
    const bucket = layerBuckets.get(layer)!;
    for (const entityIndex of bucket) {
      const gen = world.generations[entityIndex];
      const entity = new Entity(entityIndex, gen);

      if (!world.hasComponent(entity, 'Visible') || world.hasComponent(entity, 'Culled')) {
        const c = panelSprites.get(entityIndex);
        if (c) c.visible = false;
        continue;
      }

      const panel = world.getComponentByIndex<PanelComponent>(entityIndex, 'PanelComponent');
      const transform = world.getComponentByIndex<TransformComponent>(entityIndex, 'TransformComponent');
      if (!panel || !transform) continue;

      const style = styleArray[panel.styleId];
      let color = style.baseColor;
      if (world.hasComponent(entity, 'Hovered')) color = style.hoverColor ?? color;
      else if (world.hasComponent(entity, 'Selected')) color = style.selectedColor ?? color;

      let container = panelSprites.get(entityIndex);
      const w = transform.scale.x;
      const h = transform.scale.y;

      if (!container) {
        container = new PIXI.Container();
        container.label = `panel_${entityIndex}`;
        container.eventMode = 'static';
        container.on('pointerdown', (e) => {
          (window as any).__deselectImageEditor?.();
          e.stopPropagation();
        });
        stage.addChild(container);

        const bg = new PIXI.Graphics();
        bg.fill({ color: toHexColor(color.r, color.g, color.b), alpha: color.a });
        bg.rect(0, 0, w, h);
        bg.fill();
        container.addChild(bg);
        (container as any).__bg = bg;

        // clip children
        if (panel.clipChildren) {
          const mask = new PIXI.Graphics();
          mask.fill({ color: 0xffffff });
          mask.rect(0, 0, w, h);
          mask.fill();
          container.addChild(mask);
          container.mask = mask;
        }

        panelSprites.set(entityIndex, container);
        lastScaleX.set(entityIndex, w);
        lastScaleY.set(entityIndex, h);
        lastColorHex.set(entityIndex, toHexColor(color.r, color.g, color.b));
      } else {
        container.visible = true;
        const prevW = lastScaleX.get(entityIndex) ?? w;
        const prevH = lastScaleY.get(entityIndex) ?? h;
        const prevHex = lastColorHex.get(entityIndex);
        const newHex = toHexColor(color.r, color.g, color.b);
        if (prevW !== w || prevH !== h || prevHex !== newHex) {
          const bg = (container as any).__bg as PIXI.Graphics;
          if (bg) {
            bg.clear();
            bg.fill({ color: newHex, alpha: color.a });
            bg.rect(0, 0, w, h);
            bg.fill();
          }
          const existingMask = container.mask as PIXI.Graphics | undefined;
          if (existingMask) {
            existingMask.clear();
            existingMask.fill({ color: 0xffffff });
            existingMask.rect(0, 0, w, h);
            existingMask.fill();
          }
          lastScaleX.set(entityIndex, w);
          lastScaleY.set(entityIndex, h);
          lastColorHex.set(entityIndex, newHex);
        }
      }

      container.x = transform.position.x - w / 2;
      container.y = transform.position.y - h / 2;
      container.zIndex = panel.layer;
      container.alpha = panel.alpha;
    }
  }

  // ========== TEXT ==========
  world.forEachIndex2<TextComponent, TransformComponent>(
    'TextComponent',
    'TransformComponent',
    (idx, textComp, transform) => {
      const gen = world.generations[idx];
      const entity = new Entity(idx, gen);

      if (!world.hasComponent(entity, 'Visible')) {
        const txt = textSprites.get(idx);
        if (txt) txt.visible = false;
        return;
      }

      let panelVisible = true;
      if (textComp.panelIndex >= 0) {
        const pGen = world.generations[textComp.panelIndex];
        const pEntity = new Entity(textComp.panelIndex, pGen);
        panelVisible = world.hasComponent(pEntity, 'Visible');
      }
      if (!panelVisible) {
        const txt = textSprites.get(idx);
        if (txt) txt.visible = false;
        return;
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
        stage!.addChild(txt);
        textSprites.set(idx, txt);
      }

      txt.visible = true;
      txt.x = transform.position.x;
      txt.y = transform.position.y;
      txt.alpha = textComp.color.a;
      txt.zIndex = textComp.layer;

      const isVertical = Math.abs(textComp.rotation ?? 0) === 90 || Math.abs(textComp.rotation ?? 0) === 270;
      if (isVertical) txt.anchor.set(0.5);
      else {
        const align = textComp.align ?? 'left';
        if (align === 'center') txt.anchor.set(0.5, 0);
        else if (align === 'right') txt.anchor.set(1, 0);
        else txt.anchor.set(0, 0);
      }
      const vAlign = textComp.vAlign ?? 'top';
      if (vAlign === 'middle') txt.anchor.y = 0.5;
      else if (vAlign === 'bottom') txt.anchor.y = 1;

      txt.rotation = (textComp.rotation ?? 0) * Math.PI / 180;
    }
  );
}

export function resetDisplay() {
  for (const c of panelSprites.values()) if (c.parent) c.removeFromParent();
  for (const t of textSprites.values()) if (t.parent) t.removeFromParent();
  panelSprites.clear();
  textSprites.clear();
  lastScaleX.clear();
  lastScaleY.clear();
  lastColorHex.clear();
}

registerSystemMethod('SETUE.Scene.Scene2D', 'Update', Update);
