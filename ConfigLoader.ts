import * as PIXI from 'pixi.js';
import { parseCsvArray } from './parseCsv.js';

type RowHandler = (row: Record<string, string>, app: PIXI.Application) => Promise<void> | void;

export class ConfigLoader {
  private static handlers = new Map<string, RowHandler>();

  // Load WebHelper.csv and register all enabled handlers
  static async loadHelpers(helperCsvText: string) {
    const rows = parseCsvArray(helperCsvText);
    for (const row of rows) {
      if (row['Enabled']?.toLowerCase() !== 'true') continue;
      const type = row['Type']?.toLowerCase();
      const modulePath = row['ModulePath'];
      if (!type || !modulePath) continue;

      try {
        const module = await import(/* @vite-ignore */ modulePath);
        if (typeof module.default === 'function') {
          this.handlers.set(type, module.default);
          console.log(`[ConfigLoader] Registered handler "${type}" from ${modulePath}`);
        } else {
          console.warn(`[ConfigLoader] Module ${modulePath} lacks default export, skipping`);
        }
      } catch (err) {
        console.error(`[ConfigLoader] Failed to load module ${modulePath}:`, err);
      }
    }
  }

  // Process all rows of Master.csv
  static async processRows(masterCsvText: string, app: PIXI.Application) {
    const rows = parseCsvArray(masterCsvText);
    for (const row of rows) {
      if (row['Enabled']?.toLowerCase() === 'false') continue;
      const type = row['Type']?.toLowerCase();
      if (!type) continue;

      const handler = this.handlers.get(type);
      if (!handler) {
        console.warn(`[ConfigLoader] No handler for Type="${type}", skipping row`);
        continue;
      }

      try {
        await handler(row, app);
      } catch (err) {
        console.error(`[ConfigLoader] Error processing row (Type="${type}"):`, err);
      }
    }
  }

  // Main entry point
  static async load(masterCsvText: string, helperCsvText: string, app: PIXI.Application) {
    await this.loadHelpers(helperCsvText);
    await this.processRows(masterCsvText, app);
  }
}
