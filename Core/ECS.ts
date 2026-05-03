// ============================================================
// ECS.ts  –  Entity Component System (tags + sparse sets)
//            Production‑ready core, movement groups + all flags
// ============================================================

import { parseCsvArray } from '../parseCsv.js';

// ------------------------------------------------------------------
//  ENTITY
// ------------------------------------------------------------------
export class Entity {
    constructor(public readonly index: number, public readonly generation: number) {}
    equals(other: Entity): boolean { return this.index === other.index && this.generation === other.generation; }
    toString(): string { return `Entity(${this.index}:${this.generation})`; }
    static Null = Object.freeze(new Entity(0, 0));
}

// ------------------------------------------------------------------
//  COMPONENT INTERFACES
// ------------------------------------------------------------------
export interface IComponent { type: string; }

export interface TransformComponent extends IComponent {
    type: 'TransformComponent';
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
    scale: { x: number; y: number; z: number };
}

export interface MeshComponent extends IComponent {
    type: 'MeshComponent';
    meshId: number;
    vertexBuffer: any;
    indexBuffer: any;
    indexCount: number;
    vertexCount: number;
    vertexStride: number;
}

export interface MaterialComponent extends IComponent {
    type: 'MaterialComponent';
    color: { r: number; g: number; b: number; a: number };
    pipelineId: number;
}

export interface LayerComponent extends IComponent {
    type: 'LayerComponent';
    layer: number;
}

export interface MVPComponent extends IComponent {
    type: 'MVPComponent';
    mvp: number[];
}

export interface SelectedComponent extends IComponent {
    type: 'SelectedComponent';
}

export interface CameraComponent extends IComponent {
    type: 'CameraComponent';
    position: { x: number; y: number; z: number };
    pivot: { x: number; y: number; z: number };
    fov: number;
    near: number;
    far: number;
    invertX: boolean;
    invertY: boolean;
}

// ---------- UI / WORLD components ----------
export interface PanelComponent extends IComponent {
    type: 'PanelComponent';
    styleId: number;
    textId: number;
    layer: number;
    alpha: number;
    clickable: boolean;
    clipChildren: boolean;
}

export interface TextComponent extends IComponent {
    type: 'TextComponent';
    id: number;
    contentId: string;
    fontId: string;
    fontSize: number;
    color: { r: number; g: number; b: number; a: number };
    align: string;
    rotation: number;
    layer: number;
    source: number;
    prefix: string;
    panelId: string;
    panelIndex: number;
    padLeft: number;
    padTop: number;
    lineHeight: number;
    vAlign: string;
    styleId: number;
}

export interface DragComponent extends IComponent {
    type: 'DragComponent';
    parentNameId: string;
    movementId: string;
    moveEdge: string;
    minX: number;
    maxX: number;
}

export interface SceneRootComponent extends IComponent { type: 'SceneRootComponent'; }
export interface NameComponent extends IComponent { type: 'NameComponent'; nameId: string; }
export interface LightComponent extends IComponent {
    type: 'LightComponent';
    color: { r: number; g: number; b: number };
    intensity: number;
    lightType: number;
}
export interface TerrainComponent extends IComponent { type: 'TerrainComponent'; }

export interface SelectableComponent extends IComponent {
    type: 'SelectableComponent';
    clickable: boolean;
    visible: boolean;
    layer: number;
}

export interface ImageComponent extends IComponent {
    type: 'ImageComponent';
    base64: string;
    width: number;
    height: number;
    sprite?: any;
}

export interface ObjectTypeComponent extends IComponent {
    type: 'ObjectTypeComponent';
    objectType: string;
}

export interface ScriptedActionsComponent extends IComponent {
    type: 'ScriptedActionsComponent';
    leftClickScript?: string;
    rightClickScript?: string;
}

// ---------- Movement group ----------
export interface MovementGroupEntry {
    entityId: number;
    attachEdge: string;   // 'all', 'right', 'left', 'top', 'bottom'
    origLeft: number;
    origTop: number;
    origWidth: number;
    origHeight: number;
    clipMinX?: number;
    clipMaxX?: number;
    clipMinY?: number;
    clipMaxY?: number;
}

export interface MovementGroupComponent extends IComponent {
    type: 'MovementGroup';
    parentMovementRule: string;   // 'drag_x', 'drag_xy'
    entries: MovementGroupEntry[];
}

// ---------- TAG components (zero‑data) ----------
export interface HoveredTag extends IComponent { type: 'Hovered'; }
export interface SelectedTag extends IComponent { type: 'Selected'; }
export interface VisibleTag extends IComponent { type: 'Visible'; }
export interface CulledTag extends IComponent { type: 'Culled'; }

export interface NavButtonComponent extends IComponent {
    type: 'NavButton';
    area: string;
}

// ---------- Dirty flags for different systems ----------
export interface MovementFlag extends IComponent {
    type: 'MovementFlag';
}

export interface CloneFlag extends IComponent {
    type: 'CloneFlag';
}

export interface RunScriptFlag extends IComponent {
    type: 'RunScriptFlag';
}

export interface FollowCursorFlag extends IComponent {
    type: 'FollowCursorFlag';
}

// ---------- Current selection (singleton) ----------
export interface CurrentSelection extends IComponent {
    type: 'CurrentSelection';
    entityId: number | null;
}

// ---------- Event / Request components ----------
export interface DragRequest extends IComponent {
    type: 'DragRequest';
    panelName: string;
    movementRule: string;
    mouseX: number;
    mouseY: number;
    resizeEdge?: string;
}

export interface SwitchTabRequest extends IComponent {
    type: 'SwitchTabRequest';
    areaName: string;
}

export interface CloneRequest extends IComponent {
    type: 'CloneRequest';
    templateName: string;
    targetParentName: string;
}

export interface RunScriptRequest extends IComponent {
    type: 'RunScriptRequest';
    scriptName: string;
}

export interface CursorState extends IComponent {
    type: 'CursorState';
    entityId: number | null;
    mouseX: number;
    mouseY: number;
}

// ------------------------------------------------------------------
//  SPARSE SET STORAGE
// ------------------------------------------------------------------
interface ComponentStorage {
    remove(entityIndex: number): void;
    has(entityIndex: number): boolean;
}

class SparseSetStorage<T extends IComponent> implements ComponentStorage {
    private dense: T[] = new Array(64);
    private sparse: number[] = new Array(1024);
    private entities: number[] = new Array(64);
    private count = 0;

    add(entityIndex: number, component: T): T {
        if (entityIndex >= this.sparse.length) {
            this.sparse.length = Math.max(entityIndex + 1, this.sparse.length * 2);
        }
        if (this.count === this.dense.length) {
            const newLen = this.dense.length * 2;
            this.dense.length = newLen;
            this.entities.length = newLen;
        }
        this.sparse[entityIndex] = this.count;
        this.entities[this.count] = entityIndex;
        this.dense[this.count] = component;
        this.count++;
        return this.dense[this.count - 1];
    }

    get(entityIndex: number): T {
        return this.dense[this.sparse[entityIndex]];
    }

    remove(entityIndex: number): void {
        if (!this.has(entityIndex)) return;
        const denseIdx = this.sparse[entityIndex];
        const lastIdx = this.count - 1;
        if (denseIdx !== lastIdx) {
            const lastEntity = this.entities[lastIdx];
            this.dense[denseIdx] = this.dense[lastIdx];
            this.entities[denseIdx] = lastEntity;
            this.sparse[lastEntity] = denseIdx;
        }
        this.count--;
        this.sparse[entityIndex] = 0;
    }

    has(entityIndex: number): boolean {
        return entityIndex < this.sparse.length &&
               this.sparse[entityIndex] < this.count &&
               this.entities[this.sparse[entityIndex]] === entityIndex;
    }

    getCount(): number { return this.count; }
    getDenseArray(): T[] { return this.dense; }
    getEntityIndices(): number[] { return this.entities; }

    forEachIndex(callback: (entityIndex: number, comp: T) => void): void {
        const count = this.count;
        const ents = this.entities;
        const comps = this.dense;
        for (let i = 0; i < count; i++) {
            callback(ents[i], comps[i]);
        }
    }
}

// ------------------------------------------------------------------
//  WORLD
// ------------------------------------------------------------------
export class World {
    private nextEntityId = 1;
    generations: number[] = new Array(1024).fill(0);
    private freeIndices: number[] = [];
    private storages = new Map<string, SparseSetStorage<any>>();
    private commands: (() => void)[] = [];

    private getStorage<T extends IComponent>(typeName: string): SparseSetStorage<T> {
        if (!this.storages.has(typeName)) {
            this.storages.set(typeName, new SparseSetStorage<T>());
        }
        return this.storages.get(typeName)!;
    }

    createEntity(): Entity {
        let index: number;
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!;
        } else {
            index = this.nextEntityId++;
            if (index >= this.generations.length) this.generations.length *= 2;
        }
        const gen = (this.generations[index] ?? 0) + 1;
        this.generations[index] = gen;
        return new Entity(index, gen);
    }

    createActionEntity<T extends IComponent>(comp: T): Entity {
        const e = this.createEntity();
        this.addComponent(e, comp);
        return e;
    }

    destroyEntity(e: Entity): void {
        this.commands.push(() => {
            if (e.index >= this.generations.length || this.generations[e.index] !== e.generation) return;
            for (const storage of this.storages.values()) storage.remove(e.index);
            this.generations[e.index]++;
            this.freeIndices.push(e.index);
        });
    }

    isAlive(index: number, generation: number): boolean {
        return index < this.generations.length && this.generations[index] === generation;
    }

    addComponent<T extends IComponent>(e: Entity, comp: T): void {
        const idx = e.index, gen = e.generation;
        this.commands.push(() => {
            if (!this.isAlive(idx, gen)) return;
            const storage = this.getStorage<T>(comp.type);
            if (!storage.has(idx)) {
                storage.add(idx, comp);
            } else {
                const denseIdx = (storage as any)['sparse'][idx];
                (storage as any)['dense'][denseIdx] = comp;
            }
        });
    }

    getComponent<T extends IComponent>(e: Entity, typeName: string): T | undefined {
        if (!this.isAlive(e.index, e.generation)) return undefined;
        const storage = this.storages.get(typeName);
        return storage?.has(e.index) ? storage.get(e.index) as T : undefined;
    }

    getComponentByIndex<T extends IComponent>(entityIndex: number, typeName: string): T | undefined {
        const storage = this.storages.get(typeName) as SparseSetStorage<T>;
        if (!storage) return undefined;
        return storage.has(entityIndex) ? storage.get(entityIndex) : undefined;
    }

    setComponent<T extends IComponent>(e: Entity, comp: T): void {
        this.addComponent(e, comp);
    }

    hasComponent(e: Entity, typeName: string): boolean {
        if (!this.isAlive(e.index, e.generation)) return false;
        const storage = this.storages.get(typeName);
        return storage ? storage.has(e.index) : false;
    }

    hasComponentByIndex(entityIndex: number, typeName: string): boolean {
        const storage = this.storages.get(typeName);
        return storage ? storage.has(entityIndex) : false;
    }

    removeComponent(e: Entity, typeName: string): void {
        this.commands.push(() => {
            if (!this.isAlive(e.index, e.generation)) return;
            this.storages.get(typeName)?.remove(e.index);
        });
    }

    addTag(e: Entity, tagType: string): void {
        this.addComponent(e, { type: tagType } as any);
    }

    removeTag(e: Entity, tagType: string): void {
        this.removeComponent(e, tagType);
    }

    executeCommands(): void {
        for (let i = 0; i < this.commands.length; i++) this.commands[i]();
        this.commands.length = 0;
    }

    forEachIndex<T extends IComponent>(typeName: string, callback: (entityIndex: number, comp: T) => void): void {
        const storage = this.storages.get(typeName) as SparseSetStorage<T>;
        if (!storage) return;
        storage.forEachIndex(callback);
    }

    forEachIndex2<T1 extends IComponent, T2 extends IComponent>(
        type1: string, type2: string,
        callback: (entityIndex: number, comp1: T1, comp2: T2) => void
    ): void {
        const s1 = this.storages.get(type1) as SparseSetStorage<T1>;
        const s2 = this.storages.get(type2) as SparseSetStorage<T2>;
        if (!s1 || !s2) return;
        const smallest = s1.getCount() <= s2.getCount() ? s1 : s2;
        const other = smallest === s1 ? s2 : s1;
        const entities = smallest.getEntityIndices();
        const comps = smallest.getDenseArray();
        const count = smallest.getCount();
        for (let i = 0; i < count; i++) {
            const idx = entities[i];
            if (other.has(idx)) {
                const comp1Val = (smallest === s1 ? comps[i] : other.get(idx)) as T1;
                const comp2Val = (other === s2 ? other.get(idx) : comps[i]) as T2;
                callback(idx, comp1Val, comp2Val);
            }
        }
    }

    forEachIndex3<T1 extends IComponent, T2 extends IComponent, T3 extends IComponent>(
        type1: string, type2: string, type3: string,
        callback: (entityIndex: number, comp1: T1, comp2: T2, comp3: T3) => void
    ): void {
        const s1 = this.storages.get(type1) as SparseSetStorage<T1>;
        const s2 = this.storages.get(type2) as SparseSetStorage<T2>;
        const s3 = this.storages.get(type3) as SparseSetStorage<T3>;
        if (!s1 || !s2 || !s3) return;
        const sets = [s1, s2, s3].sort((a, b) => a.getCount() - b.getCount());
        const smallest = sets[0], e1 = sets[1], e2 = sets[2];
        const entities = smallest.getEntityIndices();
        const count = smallest.getCount();
        for (let i = 0; i < count; i++) {
            const idx = entities[i];
            if (e1.has(idx) && e2.has(idx)) {
                callback(idx, s1.get(idx), s2.get(idx), s3.get(idx));
            }
        }
    }
}
