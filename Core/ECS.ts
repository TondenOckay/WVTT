// ============================================================
// ECS.ts  –  Combined Entity Component System
//            (mirrors your original ECS.cs + ECS.csv logic)
// ============================================================

import { parseCsvArray } from '../parseCsv.js'; // your generic CSV parser

// ------------------------------------------------------------------
//  ENTITY
// ------------------------------------------------------------------
export class Entity {
    constructor(public readonly index: number, public readonly generation: number) {}
    equals(other: Entity): boolean { return this.index === other.index && this.generation === other.generation; }
    toString(): string { return `Entity(${this.index}:${this.generation})`; }
    static Null = new Entity(0, 0);
}

// ------------------------------------------------------------------
//  COMPONENT INTERFACES  (mirrors your C# structs)
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

// ------------------------------------------------------------------
//  SPARSE SET STORAGE  (exactly matches C# ComponentStorage<T>)
// ------------------------------------------------------------------
interface ComponentStorage { remove(entityIndex: number): void; has(entityIndex: number): boolean; }

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
}

// ------------------------------------------------------------------
//  WORLD  (matches C# World class, including command buffer)
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
            index = this.freeIndices.shift()!;
        } else {
            index = this.nextEntityId++;
            if (index >= this.generations.length) {
                this.generations.length *= 2;
                // new entries will be undefined; we fill with 0 later (they default to 0)
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

    // --- Component API ---
    addComponent<T extends IComponent>(e: Entity, comp: T): void {
        this.commands.push(() => {
            if (e.index >= this.generations.length || this.generations[e.index] !== e.generation) return;
            const storage = this.getStorage<T>(comp.type);
            if (!storage.has(e.index)) {
                storage.add(e.index, comp);
            } else {
                // overwrite
                const denseIdx = storage['sparse'][e.index];
                storage['dense'][denseIdx] = comp;
            }
        });
    }

    getComponent<T extends IComponent>(e: Entity, typeName: string): T | undefined {
        if (e.index >= this.generations.length || this.generations[e.index] !== e.generation) return undefined;
        const storage = this.storages.get(typeName);
        return storage?.has(e.index) ? storage.get(e.index) as T : undefined;
    }

    setComponent<T extends IComponent>(e: Entity, comp: T): void {
        this.addComponent(e, comp);  // identical behavior
    }

    hasComponent(e: Entity, typeName: string): boolean {
        if (e.index >= this.generations.length || this.generations[e.index] !== e.generation) return false;
        const storage = this.storages.get(typeName);
        return storage ? storage.has(e.index) : false;
    }

    removeComponent(e: Entity, typeName: string): void {
        this.commands.push(() => {
            if (e.index >= this.generations.length || this.generations[e.index] !== e.generation) return;
            this.storages.get(typeName)?.remove(e.index);
        });
    }

    executeCommands(): void {
        while (this.commands.length > 0) this.commands.shift()!();
    }

    // --- Query helpers (mirroring ForEach + Query) ---
    forEach<T extends IComponent>(typeName: string, action: (entity: Entity, comp: T) => void): void {
        const storage = this.storages.get(typeName) as SparseSetStorage<T>;
        if (!storage) return;
        const entities = storage.getEntityIndices();
        const comps = storage.getDenseArray();
        const count = storage.getCount();
        for (let i = 0; i < count; i++) {
            const idx = entities[i];
            action(new Entity(idx, this.generations[idx]), comps[i]);
        }
    }

    query<T extends IComponent>(typeName: string): [Entity, T][] {
        const result: [Entity, T][] = [];
        this.forEach(typeName, (e, c) => result.push([e, c]));
        return result;
    }

    // --- Multi-component queries (using smallest set, same as C#) ---
    forEach2<T1 extends IComponent, T2 extends IComponent>(
        type1: string, type2: string, action: (e: Entity, c1: T1, c2: T2) => void
    ): void {
        const s1 = this.storages.get(type1) as SparseSetStorage<T1>;
        const s2 = this.storages.get(type2) as SparseSetStorage<T2>;
        if (!s1 || !s2) return;
        const smallest = s1.getCount() <= s2.getCount() ? s1 : s2;
        const other = smallest === s1 ? s2 : s1;
        const entities = smallest.getEntityIndices();
        const comps = smallest.getDenseArray();
        for (let i = 0; i < smallest.getCount(); i++) {
            const idx = entities[i];
            if (other.has(idx)) {
                const e = new Entity(idx, this.generations[idx]);
                if (smallest === s1) action(e, comps[i], other.get(idx) as T2);
                else action(e, other.get(idx) as T1, comps[i]);
            }
        }
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
        const s1 = this.storages.get(type1) as SparseSetStorage<T1>;
        const s2 = this.storages.get(type2) as SparseSetStorage<T2>;
        const s3 = this.storages.get(type3) as SparseSetStorage<T3>;
        if (!s1 || !s2 || !s3) return;
        const smallest = [s1, s2, s3].sort((a, b) => a.getCount() - b.getCount())[0];
        const others = (smallest === s1 ? [s2, s3] : smallest === s2 ? [s1, s3] : [s1, s2]);
        const entities = smallest.getEntityIndices();
        const comps = smallest.getDenseArray();
        for (let i = 0; i < smallest.getCount(); i++) {
            const idx = entities[i];
            if (others.every(s => s.has(idx))) {
                const e = new Entity(idx, this.generations[idx]);
                if (smallest === s1) action(e, comps[i], others[0].get(idx) as T2, others[1].get(idx) as T3);
                else if (smallest === s2) action(e, others[0].get(idx) as T1, comps[i], others[1].get(idx) as T3);
                else action(e, others[0].get(idx) as T1, others[1].get(idx) as T2, comps[i]);
            }
        }
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
//  SYSTEM RUNNER  (replaces ECSSystemRunner.ts, reads ECS.csv)
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
    // Sort by Order
    enabledSystems.sort((a, b) => a.order - b.order);

    // Execute (for Boot, we might call with delta 0; later, during Update, you'd pass the frame delta)
    for (const sys of enabledSystems) {
        try {
            sys.fn(world, 0);
        } catch (err) {
            console.error(`[ECS] Error in system "${sys.name}":`, err);
        }
    }
}

// ------------------------------------------------------------------
//  OPTIONAL: scheduler-compatible Load method
// ------------------------------------------------------------------
export function Load(): void {
    // This is called from Scheduler Boot (you need a reference to a world)
    // We'll assume you set a global or imported world reference.
    // In practice, you'd do: loadAndRunECSSystems('ECS/ECS.csv', globalWorld);
}
