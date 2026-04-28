// Window.ts
import * as PIXI from 'pixi.js';
import { registerSystemMethod } from './Core/Scheduler.js';
import { parseSettingsCsv } from './parseCsv.js';

export const Window = {
  app: null as PIXI.Application | null,

  create(settings: Record<string, string | number | boolean>): PIXI.Application {
    const rawBg = settings['BackgroundColor'];
    const bgColor = rawBg
      ? (typeof rawBg === 'string' ? Number(rawBg) : (rawBg as number))
      : 0x1099bb;

    const canvas = document.createElement('canvas');
    canvas.id = 'engineCanvas';
    canvas.width  = settings['Width'] as number;
    canvas.height = settings['Height'] as number;
    document.body.appendChild(canvas);

    this.app = new PIXI.Application();
    this.app.init({
      canvas,
      width: canvas.width,
      height: canvas.height,
      backgroundColor: bgColor,
      antialias: true,
      autoDensity: true,
      resizeTo: settings['Resizable'] ? window : undefined,
    }).then(() => {
      console.log('[Window] PixiJS renderer initialised');
    });

    document.title = (settings['Title'] as string) || 'SETUE Engine';
    console.log('[Window] Canvas added to DOM with size', canvas.width, canvas.height);
    return this.app;
  }
};

async function Window_Load() {
  // Load exactly one CSV – no fallback, no BaseWorldData
  const response = await fetch('Window.csv');
  const text = await response.text();
  const settings = parseSettingsCsv(text);
  Window.create(settings);
}

function Window_ProcessEvents() {
  // DOM events handled by Input.ts
}

registerSystemMethod('SETUE.Window', 'Load', Window_Load);
registerSystemMethod('SETUE.Window', 'ProcessEvents', Window_ProcessEvents);
