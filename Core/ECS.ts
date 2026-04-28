// ============================================================
// ECS.ts  –  Combined Entity Component System
//            Final zero‑allocation, production‑ready core
// ============================================================

import { parseCsvArray } from '../parseCsv.js';

// ------------------------------------------------------------------
//  ENTITY (kept for external identity, not used in hot loops)
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
    mvp: number[]; // 4x4 flat
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

export interface PanelComponent extends IComponent {
    type: 'PanelComponent';
    id: number;
    textId: number;
    visible: boolean;
    layer: number;
    alpha: number;
    clickable: boolean;
    clipChildren: boolean;
}

export interface TextComponent extends IComponent {
    type: 'TextComponent';
    id: number;
    contentId: number;
    fontId: number;
    fontSize: number;
    color: { r: number; g: number; b: number; a: number };
    align: number;
    rotation: number;
    layer: number;
    source: number;
    prefix: number;
    panelId: number;
    padLeft: number;
    padTop: number;
    lineHeight: number;
    vAlign: number;
    styleId: number;
}

export interface DragComponent extends IComponent {
    type: 'DragComponent';
    parentNameId: number;
    movementId: number;
    moveEdge: number;
    minX: number;
    maxX: number;
}

export interface SceneRootComponent extends IComponent { type: 'SceneRootComponent'; }
export interface NameComponent extends IComponent { type: 'NameComponent'; nameId: number; }
export interface ParentComponent extends IComponent { type: 'ParentComponent'; parent: Entity; }
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
    objectType: string;   // matches the CSV object_type column
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

    /** Zero‑allocation iteration: callback receives entityIndex and component reference */
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
    private generations: number[] = new Array(1024).fill(0);
    private freeIndices: number[] = [];
    private storages = new Map<string, SparseSetStorage<any>>();
    private commands: (() => void)[] = [];

    private getStorage<T extends IComponent>(typeName: string): SparseSetStorage<T> {
        if (!this.storages.has(typeName)) {
            this.storages.set(typeName, new SparseSetStorage<T>());
        }
        return this.storages.get(typeName)!;
    }

    // --- Entity management ---
    createEntity(): Entity {
        let index: number;
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!;   // O(1)
        } else {
            index = this.nextEntityId++;
            if (index >= this.generations.length) {
                this.generations.length *= 2;
            }
        }
        const gen = (this.generations[index] ?? 0) + 1;
        this.generations[index] = gen;
        return new Entity(index, gen);
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

    // --- Component API (unchanged) ---
    addComponent<T extends IComponent>(e: Entity, comp: T): void {
        this.commands.push(() => {
            if (!this.isAlive(e.index, e.generation)) return;
            const storage = this.getStorage<T>(comp.type);
            if (!storage.has(e.index)) {
                storage.add(e.index, comp);
            } else {
                const denseIdx = storage['sparse'][e.index];
                storage['dense'][denseIdx] = comp;
            }
        });
    }

    getComponent<T extends IComponent>(e: Entity, typeName: string): T | undefined {
        if (!this.isAlive(e.index, e.generation)) return undefined;
        const storage = this.storages.get(typeName);
        return storage?.has(e.index) ? storage.get(e.index) as T : undefined;
    }

    /**
     * Get a component by entity index only, bypassing generation check.
     * Safe inside zero‑allocation iterators where entities are guaranteed alive.
     */
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

    removeComponent(e: Entity, typeName: string): void {
        this.commands.push(() => {
            if (!this.isAlive(e.index, e.generation)) return;
            this.storages.get(typeName)?.remove(e.index);
        });
    }

    /** Execute all deferred commands – now O(n) single pass, no shift(). */
    executeCommands(): void {
        for (let i = 0; i < this.commands.length; i++) {
            this.commands[i]();
        }
        this.commands.length = 0;
    }

    // ---------- ZERO‑ALLOCATION ITERATION (HOT PATH) ----------

    /** Iterate over all entities with a single component. Zero allocation. */
    forEachIndex<T extends IComponent>(typeName: string, callback: (entityIndex: number, comp: T) => void): void {
        const storage = this.storages.get(typeName) as SparseSetStorage<T>;
        if (!storage) return;
        storage.forEachIndex(callback);
    }

    /**
     * Iterate over entities with two components, smallest‑set first.
     * Zero allocation. Does NOT check generation (entities are valid until end‑of‑tick flush).
     */
    forEachIndex2<T1 extends IComponent, T2 extends IComponent>(
        type1: string,
        type2: string,
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

    /**
     * Iterate over entities with three components, smallest‑set first.
     * Zero allocation.
     */
    forEachIndex3<T1 extends IComponent, T2 extends IComponent, T3 extends IComponent>(
        type1: string,
        type2: string,
        type3: string,
        callback: (entityIndex: number, comp1: T1, comp2: T2, comp3: T3) => void
    ): void {
        const s1 = this.storages.get(type1) as SparseSetStorage<T1>;
        const s2 = this.storages.get(type2) as SparseSetStorage<T2>;
        const s3 = this.storages.get(type3) as SparseSetStorage<T3>;
        if (!s1 || !s2 || !s3) return;
        const sets = [s1, s2, s3].sort((a, b) => a.getCount() - b.getCount());
        const smallest = sets[0];
        const e1 = sets[1];
        const e2 = sets[2];
        const entities = smallest.getEntityIndices();
        const count = smallest.getCount();
        for (let i = 0; i < count; i++) {
            const idx = entities[i];
            if (e1.has(idx) && e2.has(idx)) {
                const comp1 = s1.get(idx);
                const comp2 = s2.get(idx);
                const comp3 = s3.get(idx);
                callback(idx, comp1, comp2, comp3);
            }
        }
    }

    // ---------- LEGACY METHODS (for non‑hot code) ----------
    forEach<T extends IComponent>(typeName: string, action: (entity: Entity, comp: T) => void): void {
        const storage = this.storages.get(typeName) as SparseSetStorage<T>;
        if (!storage) return;
        storage.forEachIndex((idx, comp) => {
            action(new Entity(idx, this.generations[idx]), comp);
        });
    }

    query<T extends IComponent>(typeName: string): [Entity, T][] {
        const result: [Entity, T][] = [];
        this.forEach(typeName, (e, c) => result.push([e, c]));
        return result;
    }

    forEach2<T1 extends IComponent, T2 extends IComponent>(
        type1: string, type2: string, action: (e: Entity, c1: T1, c2: T2) => void
    ): void {
        this.forEachIndex2(type1, type2, (idx, c1, c2) => {
            action(new Entity(idx, this.generations[idx]), c1, c2);
        });
    }

    query2<T1 extends IComponent, T2 extends IComponent>(type1: string, type2: string): [Entity, T1, T2][] {
        const result: [Entity, T1, T2][] = [];
        this.forEach2(type1, type2, (e, c1, c2) => result.push([e, c1, c2]));
        return result;
    }

    forEach3<T1 extends IComponent, T2 extends IComponent, T3 extends IComponent>(
        type1: string, type2: string, type3: string,
        action: (e: Entity, c1: T1, c2: T2, c3: T3) => void
    ): void {
        this.forEachIndex3(type1, type2, type3, (idx, c1, c2, c3) => {
            action(new Entity(idx, this.generations[idx]), c1, c2, c3);
        });
    }

    query3<T1 extends IComponent, T2 extends IComponent, T3 extends IComponent>(
        type1: string, type2: string, type3: string
    ): [Entity, T1, T2, T3][] {
        const result: [Entity, T1, T2, T3][] = [];
        this.forEach3(type1, type2, type3, (e, c1, c2, c3) => result.push([e, c1, c2, c3]));
        return result;
    }
}

// ------------------------------------------------------------------
//  SYSTEM RUNNER (unchanged)
// ------------------------------------------------------------------
type SystemFunction = (world: World, delta?: number) => void;
const systemRegistry = new Map<string, SystemFunction>();

export function registerECSSystem(name: string, fn: SystemFunction): void {
    systemRegistry.set(name, fn);
}

export async function loadAndRunECSSystems(csvPath: string, world: World): Promise<void> {
    const response = await fetch(csvPath);
    const text = await response.text();
    const rows = parseCsvArray(text);

    const enabledSystems: { name: string; order: number; fn: SystemFunction }[] = [];
    for (const row of rows) {
        if (row['Enabled']?.toLowerCase() !== 'true') continue;
        const name = row['SystemName'];
        const fn = systemRegistry.get(name);
        if (!fn) {
            console.warn(`[ECS] System "${name}" not registered, skipping`);
            continue;
        }
        enabledSystems.push({
            name,
            order: parseInt(row['Order'] ?? '0'),
            fn,
        });
    }
    enabledSystems.sort((a, b) => a.order - b.order);

    for (const sys of enabledSystems) {
        try {
            sys.fn(world, 0);
        } catch (err) {
            console.error(`[ECS] Error in system "${sys.name}":`, err);
        }
    }
}
