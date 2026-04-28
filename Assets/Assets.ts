import * as PIXI from 'pixi.js';
import { registerSystemMethod } from '../Core/Scheduler.js';

const assetCache = new Map<string, PIXI.Texture | PIXI.VideoSource>();

export function getAsset(id: string) {
  return assetCache.get(id);
}

function Load() {
  // Fetch the statically generated file – Vite serves it as a normal file
  return fetch('assets/assets.json')
    .then(r => r.json() as Promise<{ id: string; path: string; type: string }[]>)
    .then(async (entries) => {
      const promises = entries.map(entry => {
        const load = entry.type === 'video'
          ? PIXI.Assets.load({ src: entry.path, data: { preload: true, autoPlay: false } })
          : PIXI.Assets.load(entry.path);
        return load
          .then(asset => { assetCache.set(entry.id, asset); console.log(`[AssetLoader] Loaded "${entry.id}"`); })
          .catch(err => console.error(`[AssetLoader] Failed to load "${entry.id}":`, err));
      });
      await Promise.all(promises);
      console.log(`[AssetLoader] ${assetCache.size} assets loaded`);
    });
}

registerSystemMethod('SETUE.Systems.AssetLoader', 'Load', Load);
