// main.ts
import './Core/SystemAssembly.js';     // <-- loads ALL system modules so they register
import { MasterClock } from './Core/MasterClock.js';
import { BaseWorldData } from './Core/BaseWorldData.js';

async function main() {
  console.log('=== Engine Starting ===');

  // 1. Load the entire base world (panels, texts, colors, selection rules, etc.)
  const response = await fetch('base-world.json');
  if (!response.ok) throw new Error('Could not load base-world.json');
  const data = await response.json();
  Object.assign(BaseWorldData, data);
  console.log('[main] Base world data loaded');

  // 2. Start the engine – Scheduler will fetch its own CSV and boot everything
  await MasterClock.load('Core/MasterClock.csv');
  MasterClock.start();
}

main();
