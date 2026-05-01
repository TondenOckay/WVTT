// Systems/FileMenuActions.ts
import { registerScript } from './ScriptRunner.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Window } from '../Window.js';
import { panelEntities, panelRegions, clearPanelData } from '../Ui/Panel.js';
import {
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  TextComponent,
  DragComponent,
  CameraComponent,
  ImageComponent,
  SelectableComponent,
  Entity,
} from '../Core/ECS.js';

function serializeWorld(): any {
  const world = getWorld();
  const data: any = { entities: [], _images: [] };

  const componentTypes = [
    'TransformComponent',
    'PanelComponent',
    'MaterialComponent',
    'TextComponent',
    'DragComponent',
    'CameraComponent',
    'ImageComponent',
    'SelectableComponent',
  ];

  const visited = new Set<number>();

  for (const [name, entity] of panelEntities) {
    if (visited.has(entity.index)) continue;
    visited.add(entity.index);
    const entry: any = {
      index: entity.index,
      generation: entity.generation,
      _panelName: name,
      components: {},
    };
    for (const type of componentTypes) {
      if (world.hasComponent(entity, type)) {
        const comp = world.getComponent(entity, type);
        if (comp) {
          const clean = { ...comp } as any;
          if (clean.sprite !== undefined) delete clean.sprite;
          entry.components[type] = clean;
        }
      }
    }
    data.entities.push(entry);
  }

  world.forEach<TextComponent>('TextComponent', (entity) => {
    if (visited.has(entity.index)) return;
    if (world.hasComponent(entity, 'PanelComponent')) return;
    visited.add(entity.index);
    const entry: any = { index: entity.index, generation: entity.generation, components: {} };
    for (const type of componentTypes) {
      if (world.hasComponent(entity, type)) {
        const comp = world.getComponent(entity, type);
        if (comp) entry.components[type] = { ...comp };
      }
    }
    data.entities.push(entry);
  });

  world.forEach<CameraComponent>('CameraComponent', (entity) => {
    if (visited.has(entity.index)) return;
    visited.add(entity.index);
    const entry: any = { index: entity.index, generation: entity.generation, components: {} };
    for (const type of componentTypes) {
      if (world.hasComponent(entity, type)) {
        const comp = world.getComponent(entity, type);
        if (comp) entry.components[type] = { ...comp };
      }
    }
    data.entities.push(entry);
  });

  console.log(`[FileMenu] Saved ${data.entities.length} entities`);
  return data;
}

function downloadFile(content: string, suggestedName: string, mime: string) {
  const name = prompt('Enter file name:', suggestedName);
  if (!name) return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function saveProject() {
  const data = serializeWorld();
  downloadFile(JSON.stringify(data, null, 2), 'project.json', 'application/json');
}

function exportImage() {
  const app = Window.app;
  if (!app) return;
  const canvas = app.renderer.extract.canvas(app.stage);
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const name = prompt('Enter image name:', 'image_export.png');
    if (!name) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function openProject() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        console.log(`[FileMenu] Loaded file: ${json.entities?.length ?? 0} entities`);
        loadWorld(json);
        console.log('[FileMenu] Project loaded');
      } catch (err) {
        console.error('[FileMenu] Failed to parse:', err);
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function loadWorld(data: any) {
  const world = getWorld();
  if (!world) return;

  // Destroy everything
  const all: Entity[] = [];
  world.forEach<any>('PanelComponent', e => all.push(e));
  world.forEach<any>('TextComponent', e => { if (!all.find(a => a.index === e.index)) all.push(e); });
  world.forEach<any>('CameraComponent', e => { if (!all.find(a => a.index === e.index)) all.push(e); });
  world.forEach<any>('ImageComponent', e => { if (!all.find(a => a.index === e.index)) all.push(e); });
  for (const e of all) world.destroyEntity(e);
  world.executeCommands();
  clearPanelData();

  if (data.entities) {
    for (const entry of data.entities) {
      const e = world.createEntity();
      const c = entry.components || {};
      const pname = entry._panelName;

      if (c.TransformComponent) world.addComponent(e, { type:'TransformComponent', ...c.TransformComponent } as any);
      if (c.PanelComponent) {
        world.addComponent(e, { type:'PanelComponent', ...c.PanelComponent } as any);
        if (pname) {
          panelEntities.set(pname, e);
          if (c.TransformComponent) {
            const t = c.TransformComponent;
            panelRegions.set(pname, {
              x: t.position.x - t.scale.x * 0.5,
              y: t.position.y - t.scale.y * 0.5,
              width: t.scale.x,
              height: t.scale.y,
            });
          }
        }
      }
      if (c.MaterialComponent) world.addComponent(e, { type:'MaterialComponent', ...c.MaterialComponent } as any);
      if (c.TextComponent) world.addComponent(e, { type:'TextComponent', ...c.TextComponent } as any);
      if (c.DragComponent) world.addComponent(e, { type:'DragComponent', ...c.DragComponent } as any);
      if (c.SelectableComponent) world.addComponent(e, { type:'SelectableComponent', ...c.SelectableComponent } as any);
      if (c.ImageComponent) {
        world.addComponent(e, { type:'ImageComponent', ...c.ImageComponent } as any);
        const imgComp = c.ImageComponent;
        if (imgComp.base64) {
          const img = new Image();
          img.onload = () => {
            const texture = (window as any).PIXI.Texture.from(img);
            const sprite = new (window as any).PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.x = c.TransformComponent?.position?.x ?? 0;
            sprite.y = c.TransformComponent?.position?.y ?? 0;
            sprite.eventMode = 'static';
            sprite.cursor = 'move';
            Window.app?.stage.addChild(sprite);
            imgComp.sprite = sprite;
            world.setComponent(e, imgComp);
          };
          img.src = imgComp.base64;
        }
      }
    }
    world.executeCommands();
    import('../Ui/Text.js').then(m => m.rebuildTextDefs());
  }

  console.log('[FileMenu] Load complete');
}

registerScript('FileMenuActions.SaveProject', saveProject);
registerScript('FileMenuActions.OpenProject', openProject);
registerScript('FileMenuActions.ExportImage', exportImage);
