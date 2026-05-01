// Assets/Assets.ts
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import * as PIXI from 'pixi.js';

const assetCache = new Map<string, PIXI.Texture | PIXI.VideoSource>();

export function getAsset(id: string) {
  return assetCache.get(id);
}

async function Load() {
  // Load the CSV that lists asset folders/IDs
  const response = await fetch('Assets/Assets.csv');
  if (!response.ok) {
    console.warn('[Assets] Assets.csv not found – skipping asset loading');
    return;
  }
  const text = await response.text();
  const rows = parseCsvArray(text);

  const entries: { id: string; path: string; type: string }[] = [];
  for (const row of rows) {
    const id = row['ID'] ?? '';
    const path = row['Path'] ?? '';
    const type = row['Type'] ?? 'image';  // 'folder' is a placeholder – real assets will have types like 'image' or 'video'
    if (!id || !path) continue;
    // If it's a folder, we skip it (folders are organisational, not loadable)
    if (type === 'folder') {
      console.log(`[Assets] Folder registered: ${path}`);
      continue;
    }
    entries.push({ id, path, type });
  }

  if (entries.length === 0) {
    console.log('[Assets] No loadable assets found in CSV – folder placeholders only');
    return;
  }

  const promises = entries.map(entry => {
    const load = entry.type === 'video'
      ? PIXI.Assets.load({ src: entry.path, data: { preload: true, autoPlay: false } })
      : PIXI.Assets.load(entry.path);
    return load
      .then(asset => {
        assetCache.set(entry.id, asset);
        console.log(`[Assets] Loaded "${entry.id}" from ${entry.path}`);
      })
      .catch(err => console.error(`[Assets] Failed to load "${entry.id}":`, err));
  });

  await Promise.all(promises);
  console.log(`[Assets] ${assetCache.size} assets loaded`);
}

registerSystemMethod('SETUE.Systems.AssetLoader', 'Load', Load);
