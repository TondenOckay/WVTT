// Controls/Movement.ts – watches MovementFlag and FollowCursorFlag
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input } from './Input.js';
import { updateSpatialIndex } from '../Ui/Panel.js';
import {
  DragComponent,
  TransformComponent,
  MovementGroupComponent,
  MovementFlag,
  FollowCursorFlag,
  Entity,
} from '../Core/ECS.js';

let activeDrag: any = null;

function UpdateDrags() {
  const world = getWorld();

  // ---- follow‑cursor mode ----
  let followEntityId: number | null = null;
  world.forEachIndex<FollowCursorFlag>('FollowCursorFlag', (idx) => {
    followEntityId = idx;
  });

  if (followEntityId !== null) {
    const gen = world.generations[followEntityId];
    const entity = new Entity(followEntityId, gen);
    const transform = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (transform) {
      transform.position.x = Input._mouseX;
      transform.position.y = Input._mouseY;
      world.setComponent<TransformComponent>(entity, transform);
      updateSpatialIndex();
    }
    return;
  }

  // ---- normal flag‑based drag ----
  let flagEntityIndex: number | null = null;
  world.forEachIndex<MovementFlag>('MovementFlag', (idx) => {
    flagEntityIndex = idx;
  });

  if (flagEntityIndex !== null) {
    startDrag(world, flagEntityIndex);
    world.removeTag(new Entity(flagEntityIndex, world.generations[flagEntityIndex]), 'MovementFlag');
  }

  if (activeDrag) updateDrag(world);
}

function startDrag(world: any, parentIdx: number) {
  const groupComp = world.getComponentByIndex<MovementGroupComponent>(parentIdx, 'MovementGroup');
  if (!groupComp || !groupComp.entries) return;
  const dragComp = world.getComponentByIndex<DragComponent>(parentIdx, 'DragComponent');
  if (!dragComp) return;

  const snapshots: any[] = [];
  for (const e of groupComp.entries) {
    const t = world.getComponentByIndex<TransformComponent>(e.entityId, 'TransformComponent');
    if (!t) continue;
    snapshots.push({
      entityId: e.entityId,
      attachEdge: e.attachEdge,
      startLeft: t.position.x - t.scale.x / 2,
      startTop:  t.position.y - t.scale.y / 2,
      startWidth:  t.scale.x,
      startHeight: t.scale.y,
      clipMinX: e.clipMinX,
      clipMaxX: e.clipMaxX,
      clipMinY: e.clipMinY,
      clipMaxY: e.clipMaxY,
    });
  }
  const parentSnap = snapshots[0];
  activeDrag = {
    parentIdx,
    parentRule: groupComp.parentMovementRule || 'drag_xy',
    entries: snapshots,
    startMouseX: Input._mouseX,
    startMouseY: Input._mouseY,
    parentStartLeft: parentSnap.startLeft,
    parentStartTop:  parentSnap.startTop,
    parentStartWidth:  parentSnap.startWidth,
    parentStartHeight: parentSnap.startHeight,
    parentMinX: isNaN(dragComp.minX) ? undefined : dragComp.minX,
    parentMaxX: isNaN(dragComp.maxX) ? undefined : dragComp.maxX,
  };
}

function updateDrag(world: any) {
  if (!activeDrag) return;
  if (!Input._held.has('MouseLeft')) {
    activeDrag = null;
    updateSpatialIndex();
    return;
  }

  let dx = Input._mouseX - activeDrag.startMouseX;
  let dy = Input._mouseY - activeDrag.startMouseY;
  if (activeDrag.parentRule === 'drag_x') dy = 0;
  else if (activeDrag.parentRule === 'drag_y') dx = 0;

  if (activeDrag.parentMinX !== undefined || activeDrag.parentMaxX !== undefined) {
    const proposedLeft = activeDrag.parentStartLeft + dx;
    let clampedLeft = proposedLeft;
    if (activeDrag.parentMinX !== undefined) clampedLeft = Math.max(activeDrag.parentMinX, clampedLeft);
    if (activeDrag.parentMaxX !== undefined) clampedLeft = Math.min(activeDrag.parentMaxX, clampedLeft);
    dx = clampedLeft - activeDrag.parentStartLeft;
  }

  for (const snap of activeDrag.entries) {
    const transform = world.getComponentByIndex<TransformComponent>(snap.entityId, 'TransformComponent');
    if (!transform) continue;

    let newLeft   = snap.startLeft;
    let newTop    = snap.startTop;
    let newWidth  = snap.startWidth;
    let newHeight = snap.startHeight;

    switch (snap.attachEdge) {
      case 'all': newLeft = snap.startLeft + dx; newTop = snap.startTop + dy; break;
      case 'right': newWidth = snap.startWidth + dx; newWidth = Math.max(1, newWidth); break;
      case 'left': newLeft = snap.startLeft + dx; newWidth = snap.startWidth - dx; newWidth = Math.max(1, newWidth); break;
      case 'bottom': newHeight = snap.startHeight + dy; newHeight = Math.max(1, newHeight); break;
      case 'top': newTop = snap.startTop + dy; newHeight = snap.startHeight - dy; newHeight = Math.max(1, newHeight); break;
    }

    if (snap.clipMinX !== undefined) newLeft = Math.max(newLeft, snap.clipMinX);
    if (snap.clipMaxX !== undefined) newLeft = Math.min(newLeft, snap.clipMaxX - newWidth);
    if (snap.clipMinY !== undefined) newTop  = Math.max(newTop,  snap.clipMinY);
    if (snap.clipMaxY !== undefined) newTop  = Math.min(newTop,  snap.clipMaxY - newHeight);

    transform.position.x = newLeft + newWidth / 2;
    transform.position.y = newTop  + newHeight / 2;
    transform.scale.x = newWidth;
    transform.scale.y = newHeight;

    world.setComponent<TransformComponent>(new Entity(snap.entityId, world.generations[snap.entityId]), transform);
  }
}

async function Load() { console.log('[Movement] Loaded'); }

registerSystemMethod('SETUE.Controls.Movement', 'Load', Load);
registerSystemMethod('SETUE.Controls.Movement', 'UpdateDrags', UpdateDrags);
