// Controls/Camera.ts – reads action tags placed by Input on its own entity
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import {
  CameraComponent,
  TransformComponent,
  Entity,
} from '../Core/ECS.js';

let cameraEntity: Entity | null = null;

async function Load() {
  const world = getWorld();

  cameraEntity = world.createEntity();
  world.addComponent<CameraComponent>(cameraEntity, {
    type: 'CameraComponent',
    position:  { x: 0, y: 0, z: 0 },
    pivot:    { x: 0, y: 0, z: 0 },
    fov:      90,
    near:     0.1,
    far:      1000,
    invertX:  false,
    invertY:  false,
  });

  world.addComponent<TransformComponent>(cameraEntity, {
    type:     'TransformComponent',
    position: { x: 0, y: 0, z: 0 },
    scale:    { x: 1, y: 1, z: 1 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  });
}

function Update(delta?: number) {
  const world = getWorld();
  const dt = delta ?? 1 / 60;
  if (!cameraEntity) return;

  // Read action tags from the ECS – Input.ts placed them there
  const left  = world.hasComponent(cameraEntity, 'Action_PanLeft');
  const right = world.hasComponent(cameraEntity, 'Action_PanRight');
  const up    = world.hasComponent(cameraEntity, 'Action_PanUp');
  const down  = world.hasComponent(cameraEntity, 'Action_PanDown');

  const cam = world.getComponent<CameraComponent>(cameraEntity, 'CameraComponent');
  const transform = world.getComponent<TransformComponent>(cameraEntity, 'TransformComponent');
  if (!cam || !transform) return;

  const speed = 5;

  if (left)  cam.position.x -= speed * dt;
  if (right) cam.position.x += speed * dt;
  if (up)    cam.position.y -= speed * dt;
  if (down)  cam.position.y += speed * dt;

  transform.position.x = cam.position.x;
  transform.position.y = cam.position.y;
  transform.position.z = cam.position.z;

  world.setComponent<CameraComponent>(cameraEntity, cam);
  world.setComponent<TransformComponent>(cameraEntity, transform);
}

registerSystemMethod('SETUE.Controls.Camera', 'Load', Load);
registerSystemMethod('SETUE.Controls.Camera', 'Update', Update);
