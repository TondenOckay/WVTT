// src/Render.ts
import { parseSettingsCsv } from './parseCsv.js';
import { registerSystemMethod } from './Core/Scheduler.js';
import * as PIXI from 'pixi.js';

let currentApp: PIXI.Application | null = null;

export function setRenderApp(app: PIXI.Application) {
  currentApp = app;
}

async function Load() {
  const response = await fetch('Render.csv');
  const csvText = await response.text();
  const settings = parseSettingsCsv(csvText);

  const r = parseFloat(settings['clear_r'] as string);
  const g = parseFloat(settings['clear_g'] as string);
  const b = parseFloat(settings['clear_b'] as string);

  if (currentApp) {
    const color = ((r * 255) << 16) | ((g * 255) << 8) | (b * 255);
    currentApp.renderer.background.color = color;
    console.log(`[Render] Clear colour set to ${color.toString(16)}`);
  } else {
    console.warn('[Render] No app reference – colour not set');
  }
  // vsync / target_fps ignored (browser handles frame scheduling)
}

// Register with scheduler
registerSystemMethod('SETUE.Render', 'Load', Load);
