// Window.ts
import * as PIXI from 'pixi.js';
import { parseSettingsCsv } from './parseCsv.js';
import { registerSystemMethod } from './Core/Scheduler.js';

export const Window = {
  app: null as PIXI.Application | null,

  async create(settings: Record<string, string | number | boolean>): Promise<PIXI.Application> {
    const rawBg = settings['BackgroundColor'];
    if (rawBg === undefined) throw new Error('[Window] BackgroundColor not found');
    const bgColor = typeof rawBg === 'string' ? Number(rawBg) : (rawBg as number);

    this.app = new PIXI.Application();
    await this.app.init({
      width: settings['Width'] as number,
      height: settings['Height'] as number,
      backgroundColor: bgColor,
      antialias: true,
      autoDensity: true,
      resizeTo: settings['Resizable'] ? window : undefined,
    });
    document.body.appendChild(this.app.canvas);
    document.title = (settings['Title'] as string) || 'SETUE Engine';
    console.log('[Window] Created');
    return this.app;
  }
};

async function Window_Load() {
  const response = await fetch('Window.csv');
  const csvText = await response.text();
  const settings = parseSettingsCsv(csvText);
  await Window.create(settings);
}

function Window_ProcessEvents() {}

registerSystemMethod('SETUE.Window', 'Load', Window_Load);
registerSystemMethod('SETUE.Window', 'ProcessEvents', Window_ProcessEvents);
