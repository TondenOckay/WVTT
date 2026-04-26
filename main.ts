import './Core/SystemAssembly.js';
import { MasterClock } from './Core/MasterClock.js';

async function main() {
  console.log('=== Engine Starting ===');
  await MasterClock.load('Core/MasterClock.csv');
  await MasterClock.start();      // <-- await start
}

main();
