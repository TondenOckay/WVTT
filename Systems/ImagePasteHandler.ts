// Systems/ImagePasteHandler.ts
import * as PIXI from 'pixi.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { panelEntities } from '../Ui/Panel.js';
import { PanelComponent, ImageComponent, Entity } from '../Core/ECS.js';
import { Window } from '../Window.js';
import { createObject } from '../Ui/Objects2D.js';

let imageContainer: PIXI.Container | null = null;
let imageCounter = 0;

function getImageContainer(): PIXI.Container {
  if (!imageContainer) {
    imageContainer = new PIXI.Container();
    imageContainer.label = 'imageContainer';
    imageContainer.zIndex = 9.1;
    Window.app?.stage.addChild(imageContainer);
  }
  return imageContainer;
}

// ---------- ECS ↔ sprite sync ----------
function startSyncLoop() {
  const app = Window.app;
  if (!app) return;
  app.ticker.add(() => {
    const world = getWorld();
    world.forEachIndex<ImageComponent>('ImageComponent', (idx, imgComp) => {
      const sprite = imgComp.sprite as PIXI.Sprite | undefined;
      if (!sprite) return;
      // Use getComponentByIndex to bypass generation check
      const t = world.getComponentByIndex<TransformComponent>(idx, 'TransformComponent');
      if (t) {
        sprite.x = t.position.x;
        sprite.y = t.position.y;
        sprite.width  = t.scale.x;
        sprite.height = t.scale.y;
      }
    });
  });
}

// ---------- Paste handling ----------
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;

  const world = getWorld();
  const editorEntity = panelEntities.get('image_editor_area');
  if (!editorEntity) return;
  const editorPanel = world.getComponent<PanelComponent>(editorEntity, 'PanelComponent');
  if (!editorPanel || !editorPanel.visible) return;

  const container = getImageContainer();

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (!blob) continue;

      const blobURL = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const texture = PIXI.Texture.from(img);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);

        // Place inside the main working area
        sprite.x = 330 + Math.random() * (1564 - 330);
        sprite.y = 100 + Math.random() * 900;

        sprite.eventMode = 'static';
        sprite.cursor = 'move';
        container.addChild(sprite);

        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;

          const entity = createObject('image', {
            x: sprite.x,
            y: sprite.y,
            w: sprite.width,
            h: sprite.height,
            base64,
            parentAreaName: 'image_editor_area',
          });

          if (!entity) {
            console.warn('[ImagePasteHandler] createObject returned null');
            return;
          }

          // Attach the sprite to the ImageComponent
          const imgComp = world.getComponent<ImageComponent>(entity, 'ImageComponent');
          if (imgComp) {
            imgComp.sprite = sprite;
            world.setComponent(entity, imgComp);
          }

          console.log(`[ImagePasteHandler] Created image entity ${entity.index}`);
        };
        reader.readAsDataURL(blob);
        URL.revokeObjectURL(blobURL);
      };

      img.onerror = () => {
        console.error('[ImagePasteHandler] Failed to load image');
        URL.revokeObjectURL(blobURL);
      };
      img.src = blobURL;
      break;   // only paste the first image
    }
  }
}

function Load() {
  getImageContainer();
  startSyncLoop();
  window.addEventListener('paste', onPaste);
  console.log('[ImagePasteHandler] Paste listener attached (Objects2D mode)');
}

registerSystemMethod('SETUE.Systems.ImagePasteHandler', 'Load', Load);
