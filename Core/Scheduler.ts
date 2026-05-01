// Core/Scheduler.ts – as provided, no changes needed
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

    const sortFn = (a: SchedulerEntry, b: SchedulerEntry) =>
      a.TimeSlot - b.TimeSlot ||
      a.Loop.localeCompare(b.Loop) ||
      a.Hub.localeCompare(b.Hub) ||
      a.RunOrder - b.RunOrder ||
      a.ClassName.localeCompare(b.ClassName);

    this.bootEntries = all.filter(e => e.Loop === 'Boot' && e.LoadMethod).sort(sortFn);
    this.updateEntries = all.filter(e => e.Loop !== 'Boot' && e.UpdateMethod).sort(sortFn);

    console.log(`[Scheduler] Loaded ${all.length} systems (${this.bootEntries.length} boot, ${this.updateEntries.length} update)`);
  }

  static async runBoot() {
    if (this.bootRun) return;
    this.bootRun = true;

    for (const entry of this.bootEntries) {
      const key = `${entry.ClassName}.${entry.LoadMethod}`;
      const func = allMethods.get(key);
      if (!func) continue;
      try {
        await func();
      } catch (err) {
        console.error(`[Scheduler] Boot error in ${key}:`, err);
      }
    }
  }

  static update(currentTime: number) {
    let dt = 0;
    if (this.lastFrameTime > 0) {
      dt = currentTime - this.lastFrameTime;
      if (dt > 0.1) dt = 0.1;
    }
    this.lastFrameTime = currentTime;

    for (const entry of this.updateEntries) {
      const key = `${entry.ClassName}.${entry.UpdateMethod}`;
      if (entry.FrequencySec > 0) {
        const last = this.lastRunTimes.get(key) || 0;
        if (currentTime - last < entry.FrequencySec) continue;
      }
      const func = allMethods.get(key);
      if (!func) continue;
      try {
        func(dt);
        this.lastRunTimes.set(key, currentTime);
      } catch (err) {
        console.error(`[Scheduler] Update error in ${key}:`, err);
      }
    }
  }
}
