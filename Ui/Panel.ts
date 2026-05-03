// Ui/Panel.ts – boot‑time static data, spatial index, area maps, layer buckets,
//               movement groups with clip constraints and linked text,
//               groups built AFTER texts are loaded
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { getColor } from './Color.js';
import { parseCsvArray } from '../parseCsv.js';
import {
  TransformComponent,
  PanelComponent,
  MaterialComponent,
  DragComponent,
  SelectableComponent,
  NavButtonComponent,
  TextComponent,
  MovementGroupComponent,
  MovementGroupEntry,
  ParentComponent,
  Entity,
} from '../Core/ECS.js';

// ---------- Legacy exports ----------
export const panelRegions = new Map<string, { x: number; y: number; width: number; height: number }>();
export const panelEntities = new Map<string, Entity>();
export const panelSourceFile = new Map<string, string>();
export const originalVisible = new Map<string, boolean>();
export let selectedPanelName: string | null = null;

// ---------- New static data exports ----------
export const PanelNameToIndex = new Map<string, number>();

export interface PanelStyle {
  baseColor: { r: number; g: number; b: number; a: number };
  hoverColor: { r: number; g: number; b: number; a: number } | null;
  selectedColor: { r: number; g: number; b: number; a: number } | null;
}
export let styleArray: PanelStyle[] = [];
export let layerBuckets: Map<number, number[]> = new Map();
export let areaToPanels: Map<string, number[]> = new Map();

// ---------- File‑name → area‑name mapping ----------
const FILE_AREA_MAP: Record<string, string> = {
  'PanelSheets.csv':        'sheet_area',
  'PanelSpellbook.csv':     'spellbook_area',
  'PanelBoard.csv':         'board_area',
  'PanelSheetEditor.csv':   'sheet_editor_area',
  'PanelMapEditor.csv':     'map_editor_area',
  'PanelImageEditor.csv':   'image_editor_area',
  'PanelSystemEditor.csv':  'system_editor_area',
};

// ---------- Quadtree for hit‑testing ----------
class QuadTree {
  private bounds: { x: number; y: number; w: number; h: number };
  private nodes: QuadTree[] = [];
  private items: { rect: { x: number; y: number; w: number; h: number }; entityId: number }[] = [];
  private maxItems = 4;
  private maxDepth = 6;
  private depth: number;

  constructor(x: number, y: number, w: number, h: number, depth = 0) {
    this.bounds = { x, y, w, h }; this.depth = depth;
  }

  insert(rect: { x: number; y: number; w: number; h: number }, entityId: number) {
    if (rect.w <= 0 || rect.h <= 0) return false;
    if (!this.intersects(this.bounds, rect)) return false;
    if (this.depth >= this.maxDepth) { this.items.push({ rect, entityId }); return true; }
    if (this.nodes.length === 0 && this.items.length < this.maxItems) { this.items.push({ rect, entityId }); return true; }
    if (this.nodes.length === 0) this.subdivide();
    for (const node of this.nodes) node.insert(rect, entityId);
    return true;
  }

  query(pointX: number, pointY: number, out: number[]): void {
    if (!this.containsPoint(this.bounds, pointX, pointY)) return;
    for (const item of this.items) if (this.containsPoint(item.rect, pointX, pointY)) out.push(item.entityId);
    for (const node of this.nodes) node.query(pointX, pointY, out);
  }

  private subdivide() {
    const { x, y, w, h } = this.bounds;
    const hw = w / 2, hh = h / 2;
    this.nodes.push(new QuadTree(x, y, hw, hh, this.depth + 1));
    this.nodes.push(new QuadTree(x + hw, y, hw, hh, this.depth + 1));
    this.nodes.push(new QuadTree(x, y + hh, hw, hh, this.depth + 1));
    this.nodes.push(new QuadTree(x + hw, y + hh, hw, hh, this.depth + 1));
    const oldItems = this.items;
    this.items = [];
    for (const item of oldItems) this.insert(item.rect, item.entityId);
  }
  private intersects(a: any, b: any) { return !(b.x > a.x + a.w || b.x + b.w < a.x || b.y > a.y + a.h || b.y + b.h < a.y); }
  private containsPoint(a: any, px: number, py: number) { return px >= a.x && px <= a.x + a.w && py >= a.y && py <= a.y + a.h; }
}

let spatialTree: QuadTree | null = null;

// ---------- Public hit‑test ----------
export function hitTestPanel(mouseX: number, mouseY: number): string | null {
  if (!spatialTree) return null;
  const world = getWorld();
  const candidates: number[] = [];
  spatialTree.query(mouseX, mouseY, candidates);
  let topLayer = -Infinity;
  let topName: string | null = null;
  for (const id of candidates) {
    if (!world.hasComponentByIndex(id, 'Visible') || world.hasComponentByIndex(id, 'Culled')) continue;
    const panel = world.getComponentByIndex<PanelComponent>(id, 'PanelComponent');
    if (!panel) continue;
    if (panel.layer > topLayer) {
      topLayer = panel.layer;
      for (const [name, entity] of panelEntities) {
        if (entity.index === id) { topName = name; break; }
      }
    }
  }
  return topName;
}

// ---------- Clear all static data ----------
export function clearPanelData() {
  panelRegions.clear();
  panelEntities.clear();
  panelSourceFile.clear();
  originalVisible.clear();
  selectedPanelName = null;
  PanelNameToIndex.clear();
  styleArray = [];
  layerBuckets = new Map();
  areaToPanels = new Map();
  spatialTree = null;
}

// ========== Update spatial index (exposed) ==========
export function updateSpatialIndex() {
  rebuildSpatialTree();
}

function rebuildSpatialTree() {
  const world = getWorld();
  spatialTree = new QuadTree(0, 0, 1920, 1080);
  for (const [, entity] of panelEntities) {
    const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
    const transform = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (panel && transform && world.hasComponent(entity, 'Visible')) {
      const w = transform.scale.x;
      const h = transform.scale.y;
      const x = transform.position.x - w / 2;
      const y = transform.position.y - h / 2;
      spatialTree!.insert({ x, y, w, h }, entity.index);
    }
  }
}

// ========== LOAD (boot – creates entities only, no groups) ==========
async function Load() {
  const world = getWorld();

  const panelFiles = [
    'Ui/Panels/PanelCore.csv',
    'Ui/Panels/PanelSheets.csv',
    'Ui/Panels/PanelSpellbook.csv',
    'Ui/Panels/PanelBoard.csv',
    'Ui/Panels/PanelSheetEditor.csv',
    'Ui/Panels/PanelMapEditor.csv',
    'Ui/Panels/PanelImageEditor.csv',
    'Ui/Panels/PanelSystemEditor.csv',
  ];

  const responses = await Promise.all(panelFiles.map(f => fetch(f)));
  const texts = await Promise.all(responses.map(r => r.text()));

  const styleMap = new Map<string, number>();
  styleArray = [];
  layerBuckets = new Map();
  areaToPanels = new Map();
  panelRegions.clear(); PanelNameToIndex.clear(); panelEntities.clear(); panelSourceFile.clear(); originalVisible.clear();
  spatialTree = new QuadTree(0, 0, 1920, 1080);

  // ---- temporary clip map (object_name → clip target name) ----
  const clipMap = new Map<string, string>();

  // ---- first pass: create entities ----
  for (let i = 0; i < panelFiles.length; i++) {
    const filePath = panelFiles[i];
    const fileName = filePath.split('/').pop()!;
    const rows = parseCsvArray(texts[i]);
    console.log(`[Panels] ${fileName} → ${rows.length} rows`);

    for (const row of rows) {
      const objName = row['object_name'];
      if (!objName || objName.startsWith('#')) continue;

      const left   = parseFloat(row['left'] ?? '0');
      const right  = parseFloat(row['right'] ?? '0');
      const top    = parseFloat(row['top'] ?? '0');
      const bottom = parseFloat(row['bottom'] ?? '0');
      const width  = right - left;
      const height = bottom - top;
      if (width <= 0 || height <= 0) continue;

      panelRegions.set(objName, { x: left, y: top, width, height });

      // ---- capture clip column (object_name -> clip target name) ----
      const clipTarget = (row['clip'] ?? '').trim();
      if (clipTarget) clipMap.set(objName, clipTarget);

      const colorId = row['color_id'] ?? 'White';
      const hoverColorId = row['hover_color_id']?.trim();
      const selColorId = row['selected_color_id']?.trim();
      const styleKey = `${colorId}|${hoverColorId}|${selColorId}`;
      if (!styleMap.has(styleKey)) {
        const base = getColor(colorId);
        const hover = hoverColorId ? getColor(hoverColorId) : null;
        const sel = selColorId ? getColor(selColorId) : null;
        styleArray.push({
          baseColor: { r: base.r, g: base.g, b: base.b, a: base.alpha },
          hoverColor: hover ? { r: hover.r, g: hover.g, b: hover.b, a: hover.alpha } : null,
          selectedColor: sel ? { r: sel.r, g: sel.g, b: sel.b, a: sel.alpha } : null,
        });
        styleMap.set(styleKey, styleArray.length - 1);
      }
      const styleId = styleMap.get(styleKey)!;

      const entity = world.createEntity();
      panelEntities.set(objName, entity);
      PanelNameToIndex.set(objName, entity.index);
      panelSourceFile.set(objName, fileName);

      const visible = row['visible']?.toLowerCase() !== 'false';
      originalVisible.set(objName, visible);

      const transX = left + width / 2;
      const transY = top + height / 2;
      world.addComponent<TransformComponent>(entity, {
        type: 'TransformComponent',
        position: { x: transX, y: transY, z: 0 },
        scale: { x: width, y: height, z: 1 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      });

      const layer = parseInt(row['layer'] ?? '0');
      const clickable = row['clickable']?.toLowerCase() === 'true';

      world.addComponent<PanelComponent>(entity, {
        type: 'PanelComponent',
        styleId, textId: 0, layer,
        alpha: parseFloat(row['alpha'] ?? '1'),
        clickable,
        clipChildren: row['clip_children']?.toLowerCase() === 'true',
      });

      const baseCol = styleArray[styleId].baseColor;
      world.addComponent<MaterialComponent>(entity, {
        type: 'MaterialComponent',
        color: { r: baseCol.r, g: baseCol.g, b: baseCol.b, a: baseCol.a },
        pipelineId: 0,
      });

      if (visible) world.addTag(entity, 'Visible');

      const parentName = (row['parent_name'] ?? '').trim();
      if (parentName) {
        const parentEntity = panelEntities.get(parentName);
        if (parentEntity) {
          world.addComponent<ParentComponent>(entity, {
            type: 'ParentComponent',
            parent: parentEntity,
          });
        }
      }

      if (parentName === 'nav_bar' && objName.startsWith('nav_')) {
        const areaMap: Record<string, string> = {
          nav_sheets: 'sheet_area', nav_spellbook: 'spellbook_area', nav_board: 'board_area',
          nav_sheet_editor: 'sheet_editor_area', nav_map_editor: 'map_editor_area',
          nav_image_editor: 'image_editor_area', nav_system_editor: 'system_editor_area',
        };
        const area = areaMap[objName];
        if (area) world.addComponent<NavButtonComponent>(entity, { type: 'NavButton', area });
      }

      if (fileName !== 'PanelCore.csv') {
        const area = FILE_AREA_MAP[fileName] ?? null;
        if (area) {
          if (!areaToPanels.has(area)) areaToPanels.set(area, []);
          if (visible) areaToPanels.get(area)!.push(entity.index);
        }
      }

      spatialTree!.insert({ x: left, y: top, w: width, h: height }, entity.index);

      if (!layerBuckets.has(layer)) layerBuckets.set(layer, []);
      layerBuckets.get(layer)!.push(entity.index);

      const moveEdge   = (row['move_edge']   ?? '').trim();
      const callScript = (row['call_script'] ?? '').trim();
      const minX = parseFloat(row['min_x'] ?? 'NaN');
      const maxX = parseFloat(row['max_x'] ?? 'NaN');
      if (parentName || moveEdge || callScript) {
        world.addComponent<DragComponent>(entity, {
          type: 'DragComponent',
          parentNameId: parentName,
          movementId: callScript,
          moveEdge,
          minX: isNaN(minX) ? NaN : minX,
          maxX: isNaN(maxX) ? NaN : maxX,
        });
      }

      world.addComponent<SelectableComponent>(entity, {
        type: 'SelectableComponent', visible, layer, clickable,
      });
    }
  }

  world.executeCommands();

  // Save clipMap for later use in BuildMovementGroups
  (window as any).__clipMap = clipMap;

  console.log(`[Panels] Boot complete. Styles: ${styleArray.length}, Layers: ${[...layerBuckets.keys()].sort()}`);
  console.log(`[Panels] Area map keys: ${[...areaToPanels.keys()].join(', ')}`);
  (window as any).__PanelNameToIndex = PanelNameToIndex;
  (window as any).__panelEntitiesMap = panelEntities;
}

// ========== BuildMovementGroups (runs after Texts are loaded) ==========
function BuildMovementGroups() {
  const world = getWorld();
  const clipMap: Map<string, string> = (window as any).__clipMap ?? new Map();

  // Helper: get object name from entity index
  function getPanelName(entityIndex: number): string | null {
    for (const [name, ent] of panelEntities) {
      if (ent.index === entityIndex) return name;
    }
    return null;
  }

  world.forEachIndex2<DragComponent, TransformComponent>(
    'DragComponent',
    'TransformComponent',
    (parentIdx, parentDrag) => {
      if (!parentDrag.movementId || parentDrag.movementId === '') return;

      const parentName = getPanelName(parentIdx);
      if (!parentName) return;

      const entries: MovementGroupEntry[] = [];

      const addPanelToGroup = (entityIdx: number, attachEdge: string) => {
        const transform = world.getComponentByIndex<TransformComponent>(entityIdx, 'TransformComponent');
        if (!transform) return;
        const entry: MovementGroupEntry = {
          entityId: entityIdx,
          attachEdge: attachEdge || 'all',
          origLeft: transform.position.x - transform.scale.x / 2,
          origTop:  transform.position.y - transform.scale.y / 2,
          origWidth:  transform.scale.x,
          origHeight: transform.scale.y,
        };
        // clip constraints
        const objName = getPanelName(entityIdx);
        if (objName) {
          const clipTarget = clipMap.get(objName) ?? '';
          if (clipTarget) {
            const clipRegion = panelRegions.get(clipTarget);
            if (clipRegion) {
              entry.clipMinX = clipRegion.x;
              entry.clipMinY = clipRegion.y;
              entry.clipMaxX = clipRegion.x + clipRegion.width;
              entry.clipMaxY = clipRegion.y + clipRegion.height;
            }
          }
        }
        entries.push(entry);
      };

      const addTextsForPanel = (panelIdx: number) => {
        world.forEachIndex2<TextComponent, TransformComponent>(
          'TextComponent',
          'TransformComponent',
          (textIdx, textComp, textTransform) => {
            if (textComp.panelIndex === panelIdx) {
              const alreadyAdded = entries.some(e => e.entityId === textIdx);
              if (!alreadyAdded) {
                const w = textTransform.scale.x || 1;
                const h = textTransform.scale.y || 1;
                entries.push({
                  entityId: textIdx,
                  attachEdge: 'all',
                  origLeft: textTransform.position.x - w / 2,
                  origTop:  textTransform.position.y - h / 2,
                  origWidth:  w,
                  origHeight: h,
                });
              }
            }
          }
        );
      };

      const addDescendants = (currentName: string) => {
        world.forEachIndex<DragComponent>('DragComponent', (idx, drag) => {
          if (drag.parentNameId === currentName) {
            const alreadyAdded = entries.some(e => e.entityId === idx);
            if (!alreadyAdded && drag.moveEdge) {
              addPanelToGroup(idx, drag.moveEdge);
              addTextsForPanel(idx);
              const childName = getPanelName(idx);
              if (childName) addDescendants(childName);
            }
          }
        });
      };

      // Add parent itself
      addPanelToGroup(parentIdx, parentDrag.moveEdge);
      addTextsForPanel(parentIdx);

      // Recursively add children and their texts
      addDescendants(parentName);

      const parentGen = world.generations[parentIdx];
      world.addComponent<MovementGroupComponent>(
        new Entity(parentIdx, parentGen),
        { type: 'MovementGroup', parentMovementRule: parentDrag.movementId, entries }
      );
      console.log(`[Panels] Built movement group for "${parentName}" (index ${parentIdx}):`,
        entries.map(e => `${e.entityId}(${e.attachEdge})`).join(' '));
    }
  );

  world.executeCommands();
}

// Register Load and BuildMovementGroups
registerSystemMethod('SETUE.Systems.Panels', 'Load', Load);
registerSystemMethod('SETUE.Systems.Panels', 'BuildMovementGroups', BuildMovementGroups);
