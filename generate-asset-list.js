import { readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative, extname } from 'path';

const ROOT = './assets';
const OUTPUT = 'assets/assets.json';

function walk(dir, fileList = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, fileList);
    } else {
      const ext = extname(entry).toLowerCase();
      if (['.png','.jpg','.jpeg','.gif','.webp','.ktx2','.webm','.mp4'].includes(ext)) {
        const type = (ext === '.webm' || ext === '.mp4') ? 'video' : 'texture';
        fileList.push({
          id: entry.replace(/\.[^/.]+$/, ''),   // filename without extension
          path: relative(process.cwd(), full).replace(/\\/g, '/'),
          type
        });
      }
    }
  }
  return fileList;
}

const assets = walk(ROOT);
writeFileSync(OUTPUT, JSON.stringify(assets, null, 2));
console.log(`Generated ${OUTPUT} with ${assets.length} assets`);
