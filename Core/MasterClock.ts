// src/Core/MasterClock.ts
import { parseSettingsCsv } from '../parseCsv.js';
import { Scheduler } from './Scheduler.js';

export class MasterClock {
  private static tickInterval: number = 0;
  private static running: boolean = false;
  private static lastTickTime: number = 0;

  static async load(csvPath: string = 'Core/MasterClock.csv') {
    const response = await fetch(csvPath);
    if (!response.ok) throw new Error(`[MasterClock] Missing ${csvPath}`);
    const csvText = await response.text();
    const settings = parseSettingsCsv(csvText);

    if (settings['tick_interval'] === undefined)
      throw new Error('[MasterClock] tick_interval not found');
    this.tickInterval = parseFloat(settings['tick_interval'] as string);
    if (isNaN(this.tickInterval) || this.tickInterval <= 0)
      throw new Error(`[MasterClock] Invalid tick_interval`);

    console.log(`[MasterClock] Tick interval = ${this.tickInterval} seconds`);
    await Scheduler.load('Core/Scheduler.csv');
  }

  static async start() {                       // <-- now async
    if (this.running) return;
    if (this.tickInterval <= 0) throw new Error('[MasterClock] tickInterval not loaded');

    this.running = true;
    this.lastTickTime = performance.now() / 1000;

    console.log('[MasterClock] Started – running boot first');
    await Scheduler.runBoot();                 // <-- await the whole boot sequence
    this.scheduleNext();
  }

  static stop() {
    this.running = false;
    console.log('[MasterClock] Stopped');
  }

  private static scheduleNext() {
    requestAnimationFrame(() => {
      if (!this.running) return;

      const now = performance.now() / 1000;
      const delta = now - this.lastTickTime;

      if (delta >= this.tickInterval) {
        const steps = Math.min(Math.floor(delta / this.tickInterval), 5);
        for (let i = 0; i < steps; i++) {
          const tickTime = this.lastTickTime + this.tickInterval;
          Scheduler.update(tickTime);
          this.lastTickTime = tickTime;
        }
      }
      this.scheduleNext();
    });
  }
}
