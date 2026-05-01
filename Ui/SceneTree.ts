// Ui/SceneTree.ts
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { panelEntities, panelSourceFile } from './Panel.js';
import { Input } from '../Controls/Input.js';
import { runScript } from '../Systems/ScriptRunner.js';
import { parseCsvArray } from '../parseCsv.js';
import {
  Entity,
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  DragComponent,
  TextComponent,
  NameComponent,
  ParentComponent,
  CameraComponent,
  LightComponent,
  TerrainComponent,
  MeshComponent,
  SelectableComponent,
} from '../Core/ECS.js';

interface RowConfig {
  parentType: string;
  childType: string;
  typeName: string;
  rowTemplate: string;
  menuTemplate: string;
  createComponents: string[];
  value: string;
}

let allRows: RowConfig[] = [];
let paddingX = 8;
let paddingY = 4;
let menuOffsetX = 0;
let menuOffsetY = -10;
let menuAnchor = 'mouse';

const typeToConfig = new Map<string, RowConfig>();
const parentToChildren = new Map<string, RowConfig[]>();
const menuItemIdToConfig = new Map<string, RowConfig>();

let containerEntity: Entity | null = null;
let containerTransform: TransformComponent;
let containerPanelId = 'left_panel'; // string id

let sceneRoot: Entity | null = null;

interface RowData {
  panelEntity: Entity;
  targetEntity: Entity;
  depth: number;
}
const rows = new Map<Entity, RowData>();

let activeMenuContainer: Entity | null = null;
let activeMenuItems: Entity[] = [];
let originalPositions = new Map<Entity, { x: number; y: number; z: number }>();
let selectedEntity: Entity | null = null;
let pendingRenameEntity: Entity | null = null;
let currentContextEntity: Entity | null = null;

async function Load() {
  console.log('[SceneTree] Loading configuration...');
  await loadConfig('Ui/SceneTree.csv');
  buildLookups();
  hideAllTemplates();
  console.log('[SceneTree] Loaded');
}

async function loadConfig(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`[SceneTree] File not found: ${path}`);
  const text = await response.text();
  const rows = parseCsvArray(text);
  allRows = [];

  for (const row of rows) {
    const parentType = row['parent_type'] ?? '';
    const childType = row['child_type'] ?? '';
    const typeName = row['type_name'] ?? '';
    const rowTemplate = row['row_template'] ?? '';
    const menuTemplate = row['menu_template'] ?? '';
    const createComponents = (row['create_components'] ?? '').split(';').filter(s => s.trim());
    const value = row['value'] ?? '';

    allRows.push({ parentType, childType, typeName, rowTemplate, menuTemplate, createComponents, value });
  }
  console.log(`[SceneTree] Loaded ${allRows.length} configuration rows.`);
}

function buildLookups() {
  typeToConfig.clear();
  parentToChildren.clear();
  menuItemIdToConfig.clear();

  for (const row of allRows) {
    if (row.parentType === 'Config') {
      if (row.childType === 'padding_x') paddingX = parseFloat(row.value) || paddingX;
      else if (row.childType === 'padding_y') paddingY = parseFloat(row.value) || paddingY;
      else if (row.childType === 'menu_offset_x') menuOffsetX = parseFloat(row.value) || menuOffsetX;
      else if (row.childType === 'menu_offset_y') menuOffsetY = parseFloat(row.value) || menuOffsetY;
      else if (row.childType === 'menu_anchor') menuAnchor = row.value || menuAnchor;
    } else {
      if (row.typeName) {
        typeToConfig.set(row.typeName, row);
        console.log(`[SceneTree] Registered type: ${row.typeName}`);
      }
      if (row.parentType) {
        if (!parentToChildren.has(row.parentType)) parentToChildren.set(row.parentType, []);
        parentToChildren.get(row.parentType)!.push(row);
      }
      if (row.menuTemplate) {
        menuItemIdToConfig.set(row.menuTemplate, row);
      }
    }
  }
}

function hideAllTemplates() {
  const world = getWorld();
  for (const [name, entity] of panelEntities) {
    if (name.startsWith('_st_template_') || name.startsWith('scene_menu_')) {
      const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
      if (panel) {
        panel.visible = false;
        world.setComponent(entity, panel);
      }
    }
  }
  world.executeCommands();
}

function Update() {
  const world = getWorld();
  if (!getContainerEntity(world)) return;
  ensureSceneRoot(world);
  world.executeCommands();
  const hierarchy = buildHierarchy(world);
  syncRows(world, hierarchy);
  positionRows(world, hierarchy);

  if (Input.IsEditing) {
    if (Input.EditConfirmed) onEditConfirmed();
    else if (Input.EditCancelled) onEditCancelled();
  }
}

function getContainerEntity(world: any): boolean {
  const panelIdKey = containerPanelId; // string
  if (containerEntity && world.hasComponent(containerEntity, 'PanelComponent') && world.hasComponent(containerEntity, 'TransformComponent')) {
    const p = world.getComponent<PanelComponent>(containerEntity, 'PanelComponent')!;
    if (p.id === 0) { // panel id not used; we check panelEntities map
      if (panelEntities.get(panelIdKey) === containerEntity) {
        containerTransform = world.getComponent<TransformComponent>(containerEntity, 'TransformComponent')!;
        return true;
      }
    }
  }
  containerEntity = panelEntities.get(panelIdKey) ?? null;
  if (containerEntity) {
    containerTransform = world.getComponent<TransformComponent>(containerEntity, 'TransformComponent')!;
    return true;
  }
  return false;
}

function ensureSceneRoot(world: any) {
  if (sceneRoot && world.hasComponent(sceneRoot, 'SceneRootComponent')) return;
  sceneRoot = null;
  world.forEach('SceneRootComponent', (e: Entity) => { sceneRoot = e; });
  if (!sceneRoot) {
    sceneRoot = world.createEntity();
    world.addComponent(sceneRoot, { type: 'SceneRootComponent' });
    world.addComponent(sceneRoot, { type: 'TransformComponent', position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
    world.addComponent(sceneRoot, { type: 'NameComponent', nameId: 'Scene' });
    console.log(`[SceneTree] Created Scene root entity ${sceneRoot.index}`);
  }
}

function buildHierarchy(world: any): Map<Entity, number> {
  const result = new Map<Entity, number>();
  if (!sceneRoot) return result;
  const queue: [Entity, number][] = [[sceneRoot, 0]];
  while (queue.length) {
    const [cur, depth] = queue.shift()!;
    result.set(cur, depth);
    world.forEach('ParentComponent', (child: Entity) => {
      const pc = world.getComponent<ParentComponent>(child, 'ParentComponent');
      if (pc && pc.parent === cur) queue.push([child, depth + 1]);
    });
  }
  return result;
}

function syncRows(world: any, hierarchy: Map<Entity, number>) {
  for (const [e] of rows) {
    if (!hierarchy.has(e)) {
      world.destroyEntity(rows.get(e)!.panelEntity);
      rows.delete(e);
    }
  }
  for (const [e, depth] of hierarchy) {
    if (e === sceneRoot) continue;
    if (!rows.has(e)) createRow(world, e, depth);
  }
}

function createRow(world: any, target: Entity, depth: number) {
  const typeName = getEntityTypeName(world, target);
  if (!typeName || !typeToConfig.has(typeName)) return;
  const config = typeToConfig.get(typeName)!;
  const templateName = config.rowTemplate;
  if (!templateName) return;
  const templateEntity = panelEntities.get(templateName);
  if (!templateEntity) return;

  const rowEntity = clonePanelAsRow(world, templateEntity, target);
  if (!rowEntity) return;

  const drag = world.getComponent<DragComponent>(rowEntity, 'DragComponent') || {};
  drag.parentNameId = containerPanelId;
  world.setComponent(rowEntity, drag);

  rows.set(target, { panelEntity: rowEntity, targetEntity: target, depth });
}

function clonePanelAsRow(world: any, template: Entity, target: Entity): Entity | null {
  const tTrans = world.getComponent<TransformComponent>(template, 'TransformComponent');
  const tPanel = world.getComponent<PanelComponent>(template, 'PanelComponent');
  const tMat = world.getComponent<MaterialComponent>(template, 'MaterialComponent');
  if (!tTrans || !tPanel) return null;

  const w = containerTransform.scale.x - paddingX * 2;
  const h = tTrans.scale.y;

  const entity = world.createEntity();
  world.addComponent(entity, { type: 'TransformComponent', position: { x: 0, y: 0, z: 0 }, scale: { x: w, y: h, z: 1 } });
  world.addComponent(entity, { type: 'PanelComponent', id: 0, textId: 0, visible: true, layer: tPanel.layer, alpha: tPanel.alpha, clickable: tPanel.clickable, clipChildren: tPanel.clipChildren });
  if (tMat) world.addComponent(entity, { type: 'MaterialComponent', ...tMat });

  const name = getDisplayName(target);
  world.addComponent(entity, {
    type: 'TextComponent',
    id: 0,
    contentId: name,
    fontId: 'default',
    fontSize: 16,
    color: { r: 1, g: 1, b: 1, a: 1 },
    align: 'left',
    rotation: 0,
    layer: tPanel.layer + 1,
    source: 0,
    prefix: '',
    panelId: '',  // will be updated or left empty
    padLeft: 10,
    padTop: 0,
    lineHeight: 24,
    vAlign: 'middle',
    styleId: 0,
  });
  return entity;
}

function positionRows(world: any, hierarchy: Map<Entity, number>) {
  if (!containerEntity) return;
  const left = containerTransform.position.x - containerTransform.scale.x * 0.5;
  const top = containerTransform.position.y - containerTransform.scale.y * 0.5;
  let y = top + 104 + paddingY;

  const sorted = [...hierarchy.entries()]
    .filter(([e]) => e !== sceneRoot && rows.has(e))
    .sort((a, b) => a[1] - b[1] || a[0].index - b[0].index);

  for (const [e] of sorted) {
    const rowData = rows.get(e)!;
    const trans = world.getComponent<TransformComponent>(rowData.panelEntity, 'TransformComponent');
    if (!trans) continue;
    const h = trans.scale.y;
    trans.position = { x: left + paddingX + (containerTransform.scale.x - paddingX * 2) * 0.5, y: y + h * 0.5, z: 0 };
    world.setComponent(rowData.panelEntity, trans);
    y += h;
    if (y + h > top + containerTransform.scale.y - paddingY) break;
  }
}

function getEntityTypeName(world: any, e: Entity): string {
  if (world.hasComponent(e, 'SceneRootComponent')) return 'Scene';
  if (world.hasComponent(e, 'CameraComponent')) return 'Camera';
  if (world.hasComponent(e, 'LightComponent')) return 'Light';
  if (world.hasComponent(e, 'TerrainComponent')) return 'Terrain';
  if (world.hasComponent(e, 'MeshComponent')) return 'Object';
  if (world.hasComponent(e, 'ParentComponent')) return 'Parent';
  return 'Object';
}

function getDisplayName(e: Entity): string {
  const world = getWorld();
  const nc = world.getComponent<NameComponent>(e, 'NameComponent');
  return nc ? nc.nameId : `Entity_${e.index}`;
}

// --- Context menu ---
export function showContextMenu(clickedPanelName: string, mousePos: { x: number; y: number }) {
  const world = getWorld();
  const clickedEntity = panelEntities.get(clickedPanelName);
  if (!clickedEntity) return;

  let target: Entity | null = null;
  if (clickedPanelName === '_st_Scene') {
    target = sceneRoot;
  } else {
    for (const [e, data] of rows) {
      if (data.panelEntity === clickedEntity) { target = e; break; }
    }
  }
  if (!target) return;

  currentContextEntity = target;
  selectedEntity = target;

  const typeName = getEntityTypeName(world, target);
  const config = typeToConfig.get(typeName);
  if (!config || !config.menuTemplate) return;

  hideContextMenu();

  const menuEntity = panelEntities.get(config.menuTemplate);
  if (!menuEntity) return;

  activeMenuContainer = menuEntity;
  const menuPanel = world.getComponent<PanelComponent>(menuEntity, 'PanelComponent')!;
  activeMenuItems = [];
  for (const [name, entity] of panelEntities) {
    const drag = world.getComponent<DragComponent>(entity, 'DragComponent');
    if (drag && drag.parentNameId === config.menuTemplate) {
      activeMenuItems.push(entity);
    }
  }

  originalPositions.clear();
  const containerTrans = world.getComponent<TransformComponent>(menuEntity, 'TransformComponent')!;
  originalPositions.set(menuEntity, { ...containerTrans.position });
  for (const item of activeMenuItems) {
    const itemTrans = world.getComponent<TransformComponent>(item, 'TransformComponent')!;
    originalPositions.set(item, { ...itemTrans.position });
  }

  const menuWidth = containerTrans.scale.x;
  const menuHeight = containerTrans.scale.y;
  let desiredX: number, desiredY: number;
  if (menuAnchor === 'parent_bottom') {
    const rowData = Array.from(rows.values()).find(r => r.targetEntity === target);
    if (rowData) {
      const rowTrans = world.getComponent<TransformComponent>(rowData.panelEntity, 'TransformComponent')!;
      const rowBottom = rowTrans.position.y + rowTrans.scale.y * 0.5;
      const rowLeft = rowTrans.position.x - rowTrans.scale.x * 0.5;
      desiredX = rowLeft + menuOffsetX;
      desiredY = rowBottom + menuOffsetY;
    } else {
      desiredX = mousePos.x + menuOffsetX;
      desiredY = mousePos.y + menuOffsetY;
    }
  } else {
    desiredX = mousePos.x + menuOffsetX;
    desiredY = mousePos.y + menuOffsetY;
  }

  const sw = 1920, sh = 1080; // hardcoded for now
  if (desiredX + menuWidth > sw) desiredX = sw - menuWidth;
  if (desiredY + menuHeight > sh) desiredY = sh - menuHeight;
  if (desiredX < 0) desiredX = 0;
  if (desiredY < 0) desiredY = 0;

  const offsetX = desiredX - (containerTrans.position.x - menuWidth * 0.5);
  const offsetY = desiredY - (containerTrans.position.y - menuHeight * 0.5);

  const newPos = { x: containerTrans.position.x + offsetX, y: containerTrans.position.y + offsetY, z: containerTrans.position.z };
  containerTrans.position = newPos;
  world.setComponent(menuEntity, containerTrans);
  for (const item of activeMenuItems) {
    const itemTrans = world.getComponent<TransformComponent>(item, 'TransformComponent')!;
    itemTrans.position = { x: itemTrans.position.x + offsetX, y: itemTrans.position.y + offsetY, z: itemTrans.position.z };
    world.setComponent(item, itemTrans);
  }

  menuPanel.visible = true;
  world.setComponent(menuEntity, menuPanel);
  for (const item of activeMenuItems) {
    const itemPanel = world.getComponent<PanelComponent>(item, 'PanelComponent')!;
    itemPanel.visible = true;
    world.setComponent(item, itemPanel);
  }
  world.executeCommands();
}

export function hideContextMenu() {
  if (!activeMenuContainer) return;
  const world = getWorld();
  const menuPanel = world.getComponent<PanelComponent>(activeMenuContainer, 'PanelComponent')!;
  menuPanel.visible = false;
  world.setComponent(activeMenuContainer, menuPanel);
  for (const item of activeMenuItems) {
    const itemPanel = world.getComponent<PanelComponent>(item, 'PanelComponent')!;
    itemPanel.visible = false;
    world.setComponent(item, itemPanel);
  }

  for (const [entity, pos] of originalPositions) {
    const trans = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (trans) {
      trans.position = pos;
      world.setComponent(entity, trans);
    }
  }
  activeMenuContainer = null;
  activeMenuItems.length = 0;
  originalPositions.clear();
  world.executeCommands();
}

export function renameSelected() {
  const target = selectedEntity ?? currentContextEntity;
  if (!target) return;
  const name = getDisplayName(target);
  Input.EditBuffer = name;
  Input.EditSource = `Rename ${name}`;
  Input.IsEditing = true;
  pendingRenameEntity = target;
  hideContextMenu();
}

export function deleteSelected() {
  const target = selectedEntity ?? currentContextEntity;
  if (!target || target === sceneRoot) return;
  const world = getWorld();
  world.destroyEntity(target);
  world.executeCommands();
  hideContextMenu();
  selectedEntity = null;
}

export function createChild(menuItemName: string) {
  const world = getWorld();
  const parent = selectedEntity ?? currentContextEntity ?? sceneRoot;
  if (!parent) { hideContextMenu(); return; }
  const config = menuItemIdToConfig.get(menuItemName.replace('scene_menu_Scene_', 'scene_menu_Scene_'));
  let foundConfig: RowConfig | undefined;
  for (const [key, conf] of menuItemIdToConfig) {
    if (menuItemName === key) { foundConfig = conf; break; }
  }
  if (!foundConfig) { hideContextMenu(); return; }

  createEntity(world, parent, foundConfig);
  hideContextMenu();
}

function createEntity(world: any, parent: Entity, config: RowConfig) {
  const newEntity = world.createEntity();
  const newName = `${config.typeName}_${newEntity.index}`;
  world.addComponent(newEntity, { type: 'TransformComponent', position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
  world.addComponent(newEntity, { type: 'NameComponent', nameId: newName });
  world.addComponent(newEntity, { type: 'ParentComponent', parent });
  world.addComponent(newEntity, { type: 'ObjectTypeComponent', objectType: config.typeName });

  for (const compName of config.createComponents) {
    switch (compName) {
      case 'CameraComponent':
        world.addComponent(newEntity, { type: 'CameraComponent', position: { x: 0, y: 0, z: -5 }, pivot: { x: 0, y: 0, z: 0 }, fov: 60, near: 0.1, far: 1000, invertX: true, invertY: true });
        break;
      case 'LightComponent':
        world.addComponent(newEntity, { type: 'LightComponent', color: { r: 1, g: 1, b: 1 }, intensity: 1, lightType: 0 });
        break;
      case 'TerrainComponent':
        world.addComponent(newEntity, { type: 'TerrainComponent' });
        break;
      case 'MeshComponent':
        world.addComponent(newEntity, { type: 'MeshComponent', meshId: 0, vertexBuffer: null, indexBuffer: null, indexCount: 0, vertexCount: 0, vertexStride: 0 });
        break;
      default:
        console.warn(`[SceneTree] Unknown component ${compName}`);
    }
  }
  world.executeCommands();
  console.log(`[SceneTree] Created entity ${newName}`);
}

function onEditConfirmed() {
  if (!pendingRenameEntity) return;
  const newName = Input.EditBuffer.trim();
  if (!newName) return;
  const world = getWorld();
  const nc = world.getComponent<NameComponent>(pendingRenameEntity, 'NameComponent');
  if (nc) {
    nc.nameId = newName;
    world.setComponent(pendingRenameEntity, nc);
  }
  if (rows.has(pendingRenameEntity)) {
    const rowData = rows.get(pendingRenameEntity)!;
    const txt = world.getComponent<TextComponent>(rowData.panelEntity, 'TextComponent');
    if (txt) {
      txt.contentId = newName;
      world.setComponent(rowData.panelEntity, txt);
    }
  }
  pendingRenameEntity = null;
  Input.IsEditing = false;
}

function onEditCancelled() {
  pendingRenameEntity = null;
  Input.IsEditing = false;
}

registerSystemMethod('SETUE.UI.SceneTree', 'Load', Load);
registerSystemMethod('SETUE.UI.SceneTree', 'Update', Update);
