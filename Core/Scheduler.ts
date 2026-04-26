// src/Core/Scheduler.ts
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
  private static entries: SchedulerEntry[] = [];
  private static lastRunTimes = new Map<string, number>();
  private static bootRun = false;

  static async load(csvPath: string = 'Core/Scheduler.csv') {
    const response = await fetch(csvPath);
    const csvText = await response.text();
    const rows = parseCsvArray(csvText);

    this.entries = [];
    for (const row of rows) {
      if (row['Enabled'] !== '1') continue;
      this.entries.push({
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
      });
    }

    console.log(`[Scheduler] Loaded ${this.entries.length} systems`);
  }

  static async runBoot() {    // <-- now async
    if (this.bootRun) return;
    this.bootRun = true;

    const bootEntries = this.entries
      .filter(e => e.Loop === 'Boot' && e.LoadMethod)
      .sort((a, b) =>
        a.TimeSlot - b.TimeSlot ||
        a.Loop.localeCompare(b.Loop) ||
        a.Hub.localeCompare(b.Hub) ||
        a.RunOrder - b.RunOrder ||
        a.ClassName.localeCompare(b.ClassName)
      );

    console.log(`[Scheduler] Running ${bootEntries.length} boot methods...`);
    for (const entry of bootEntries) {
      const key = `${entry.ClassName}.${entry.LoadMethod}`;
      const func = allMethods.get(key);
      if (func) {
        try {
          if (entry.Log) console.log(`[Scheduler] Boot: ${key}`);
          const result = func();                     // call the function
          if (result instanceof Promise) {
            await result;                             // wait if it's async
          }
          console.log(`[Scheduler] Boot: ${key} succeeded.`);
        } catch (err) {
          console.error(`[Scheduler] ERROR in ${key}:`, err);
        }
      } else {
        console.warn(`[Scheduler] Boot: ${key} not found`);
      }
    }
  }

  static update(currentTime: number) {
    const regularEntries = this.entries
      .filter(e => e.Loop !== 'Boot' && e.UpdateMethod)
      .sort((a, b) =>
        a.TimeSlot - b.TimeSlot ||
        a.Loop.localeCompare(b.Loop) ||
        a.Hub.localeCompare(b.Hub) ||
        a.RunOrder - b.RunOrder ||
        a.ClassName.localeCompare(b.ClassName)
      );

    for (const entry of regularEntries) {
      const key = `${entry.ClassName}.${entry.UpdateMethod}`;
      const lastRun = this.lastRunTimes.get(key) || 0;
      if (entry.FrequencySec > 0 && (currentTime - lastRun) < entry.FrequencySec) continue;

      const func = allMethods.get(key);
      if (func) {
        try {
          if (entry.Log) console.log(`[Scheduler] Update: ${key}`);
          func();
          this.lastRunTimes.set(key, currentTime);
        } catch (err) {
          console.error(`[Scheduler] ERROR in ${key}:`, err);
        }
      }
    }
  }
}
