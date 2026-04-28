// Core/Scheduler.ts
import { parseCsvArray } from '../parseCsv.js';

export interface SchedulerEntry {
  ClassName: string;
  LoadMethod: string;
  UpdateMethod: string;
  Loop: string;
  Hub: string;
  RunOrder: number;
  TimeSlot: number;
  FrequencySec: number;
  Enabled: boolean;
  Log: boolean;
}

const allMethods = new Map<string, Function>();

export function registerSystemMethod(className: string, methodName: string, func: Function) {
  allMethods.set(`${className}.${methodName}`, func);
}

export class Scheduler {
  private static bootEntries: SchedulerEntry[] = [];
  private static updateEntries: SchedulerEntry[] = [];
  private static lastRunTimes = new Map<string, number>();
  private static lastFrameTime = 0;
  private static bootRun = false;

  static async load(csvPath: string = 'Core/Scheduler.csv') {
    const response = await fetch(csvPath);
    const csvText = await response.text();
    const rows = parseCsvArray(csvText);

    const all: SchedulerEntry[] = [];
    for (const row of rows) {
      if (row['Enabled'] !== '1') continue;
      const entry: SchedulerEntry = {
        ClassName: row['ClassName'] || '',
        LoadMethod: row['LoadMethod'] || '',
        UpdateMethod: row['UpdateMethod'] || '',
        Loop: row['Loop'] || '',
        Hub: row['Hub'] || '',
        RunOrder: parseInt(row['RunOrder'] || '0'),
        TimeSlot: parseFloat(row['TimeSlot'] || '0'),
        FrequencySec: parseFloat(row['FrequencySec'] || '0'),
        Enabled: true,
        Log: row['Log'] === '1',
      };
      all.push(entry);
    }

    // Pre‑sort and store separate lists so we never sort again
    const sortFn = (a: SchedulerEntry, b: SchedulerEntry) =>
      a.TimeSlot - b.TimeSlot ||
      a.Loop.localeCompare(b.Loop) ||
      a.Hub.localeCompare(b.Hub) ||
      a.RunOrder - b.RunOrder ||
      a.ClassName.localeCompare(b.ClassName);

    this.bootEntries = all
      .filter(e => e.Loop === 'Boot' && e.LoadMethod)
      .sort(sortFn);

    this.updateEntries = all
      .filter(e => e.Loop !== 'Boot' && e.UpdateMethod)
      .sort(sortFn);

    console.log(`[Scheduler] Loaded ${all.length} systems (${this.bootEntries.length} boot, ${this.updateEntries.length} update)`);
  }

  static async runBoot() {
    if (this.bootRun) return;
    this.bootRun = true;

    console.log(`[Scheduler] Running ${this.bootEntries.length} boot methods...`);
    for (const entry of this.bootEntries) {
      const key = `${entry.ClassName}.${entry.LoadMethod}`;
      const func = allMethods.get(key);
      if (!func) {
        if (entry.Log) console.warn(`[Scheduler] Boot: ${key} not found`);
        continue;
      }
      try {
        if (entry.Log) console.log(`[Scheduler] Boot: ${key}`);
        const result = func();
        if (result instanceof Promise) await result;
        console.log(`[Scheduler] Boot: ${key} succeeded.`);
      } catch (err) {
        console.error(`[Scheduler] ERROR in ${key}:`, err);
      }
    }
  }

  /** Called every frame by MasterClock, with the current absolute time (seconds). */
  static update(currentTime: number) {
    // Compute delta since last frame (clamped to avoid huge jumps after pause)
    let dt = 0;
    if (this.lastFrameTime > 0) {
      dt = currentTime - this.lastFrameTime;
      if (dt > 0.1) dt = 0.1;   // cap at 100ms to avoid spiral of death
    }
    this.lastFrameTime = currentTime;

    for (const entry of this.updateEntries) {
      const key = `${entry.ClassName}.${entry.UpdateMethod}`;

      // Frequency throttling (unchanged logic, but using pre‑sorted list)
      if (entry.FrequencySec > 0) {
        const lastRun = this.lastRunTimes.get(key) || 0;
        if (currentTime - lastRun < entry.FrequencySec) continue;
      }

      const func = allMethods.get(key);
      if (!func) {
        if (entry.Log) console.warn(`[Scheduler] Update: ${key} not found`);
        continue;
      }

      try {
        if (entry.Log) console.log(`[Scheduler] Update: ${key}`);
        // Pass delta time – existing functions that don’t use it will simply ignore the argument
        func(dt);
        this.lastRunTimes.set(key, currentTime);
      } catch (err) {
        console.error(`[Scheduler] ERROR in ${key}:`, err);
      }
    }
  }
}
