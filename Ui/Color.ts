import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';

interface ColorEntry { r: number; g: number; b: number; alpha: number; }
const colorMap = new Map<string, ColorEntry>();

function Load() {
  fetch('Ui/Color.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text);
      for (const row of rows) {
        const id = row['color_id'];
        if (!id) continue;
        colorMap.set(id, {
          r: parseFloat(row['r'] ?? '1'),
          g: parseFloat(row['g'] ?? '1'),
          b: parseFloat(row['b'] ?? '1'),
          alpha: parseFloat(row['alpha'] ?? '1')
        });
      }
      console.log(`[Colors] Loaded ${colorMap.size} colors`);
    });
}

export function getColor(id: string): ColorEntry {
  return colorMap.get(id) ?? { r: 1, g: 1, b: 1, alpha: 1 };
}

registerSystemMethod('SETUE.Systems.Colors', 'Load', Load);
