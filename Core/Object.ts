import { World } from './ECS.js';
import { setWorld } from './GlobalWorld.js';
import { registerSystemMethod } from './Scheduler.js';

function Load() {
  const world = new World();
  setWorld(world);
  console.log('[Object] ECS World created');
}

registerSystemMethod('SETUE.Object', 'Load', Load);
