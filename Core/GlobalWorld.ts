import { World } from './ECS.js';

let _world: World | null = null;

export function setWorld(world: World) { _world = world; }
export function getWorld(): World {
  if (!_world) throw new Error('ECS World not initialised');
  return _world;
}
