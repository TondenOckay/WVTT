// Systems/LODCullingSystem.ts – adds/removes Culled tag based on screen bounds
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { TransformComponent, PanelComponent, Entity } from '../Core/ECS.js';

function Update() {
  const world = getWorld();
  // Bounds: 0,0 to 1920,1080 (replace with camera viewport)
  world.forEachIndex2<TransformComponent, PanelComponent>(
    'TransformComponent',
    'PanelComponent',
    (idx, transform) => {
      const x = transform.position.x - transform.scale.x / 2;
      const y = transform.position.y - transform.scale.y / 2;
      const w = transform.scale.x, h = transform.scale.y;
      const offScreen = x + w < 0 || x > 1920 || y + h < 0 || y > 1080;
      const gen = world.generations[idx];
      const entity = new Entity(idx, gen);
      if (offScreen) {
        if (!world.hasComponent(entity, 'Culled')) world.addTag(entity, 'Culled');
      } else {
        if (world.hasComponent(entity, 'Culled')) world.removeTag(entity, 'Culled');
      }
    }
  );
}
registerSystemMethod('SETUE.Systems.LODCulling', 'Update', Update);
