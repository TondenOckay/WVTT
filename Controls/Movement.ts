// Controls/Movement.ts
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input, IsActionHeld } from './Input.js';
import { panelEntities } from '../Ui/Panel.js';
import { TransformComponent, PanelComponent, DragComponent } from '../Core/ECS.js';
import type { Entity } from '../Core/ECS.js';

interface MovementRule {
  id: string;
  axisConstraint: string; // 'X', 'Y', 'XY', etc.
  snapEnabled: boolean;
  snapValue: number;
  sensitivity: number;
}

const rules = new Map<string, MovementRule>();

interface ActiveDrag {
  lastMousePos: { x: number; y: number };
  parentEntity: Entity;
  rule: MovementRule;
  minX: number;
  maxX: number;
  followerEdges: Map<Entity, string>;         // entity -> moveEdge
  originalPositions: Map<Entity, { x: number; y: number; z: number }>;
  originalScales:  Map<Entity, { x: number; y: number; z: number }>;
  fixedEdgePositions: Map<Entity, number>;
}

const activeDrags = new Map<Entity, ActiveDrag>();

function Load() {
  return fetch('Controls/Movement.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text);
      rules.clear();
      for (const row of rows) {
        const id = row['id'];
        if (!id) continue;
        rules.set(id, {
          id,
          axisConstraint: row['axis'] ?? 'X',
          snapEnabled: row['snap']?.toLowerCase() === 'true',
          snapValue: parseFloat(row['snap_value'] ?? '0'),
          sensitivity: parseFloat(row['sensitivity'] ?? '1')
        });
      }
      console.log(`[Movement] Loaded ${rules.size} rules`);
    });
}

export function RuleExists(ruleId: string): boolean {
  return rules.has(ruleId);
}

export function StartDrag(panelName: string, mousePos: { x: number; y: number }, ruleId: string) {
  const world = getWorld();
  const parentEntity = panelEntities.get(panelName);
  if (!parentEntity) {
    console.warn(`[Movement] StartDrag: panel "${panelName}" not found`);
    return;
  }

  const dragComp = world.getComponent<DragComponent>(parentEntity, 'DragComponent');
  if (!dragComp) {
    console.warn(`[Movement] StartDrag: panel "${panelName}" has no DragComponent`);
    return;
  }

  const rule = rules.get(ruleId);
  if (!rule) {
    console.warn(`[Movement] StartDrag: rule "${ruleId}" not found`);
    return;
  }

  const parentTrans = world.getComponent<TransformComponent>(parentEntity, 'TransformComponent');
  if (!parentTrans) return;

  const drag: ActiveDrag = {
    lastMousePos: { ...mousePos },
    parentEntity,
    rule,
    minX: dragComp.minX ?? NaN,
    maxX: dragComp.maxX ?? NaN,
    followerEdges: new Map(),
    originalPositions: new Map(),
    originalScales: new Map(),
    fixedEdgePositions: new Map()
  };

  drag.originalPositions.set(parentEntity, { ...parentTrans.position });
  drag.originalScales.set(parentEntity, { ...parentTrans.scale });

  // Find followers (panels whose DragComponent.parentNameId equals this panel's name)
  for (const [name, entity] of panelEntities) {
    if (entity === parentEntity) continue;
    const followerDrag = world.getComponent<DragComponent>(entity, 'DragComponent');
    if (!followerDrag) continue;
    if (followerDrag.parentNameId !== panelName) continue;

    const trans = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (!trans) continue;
    drag.originalPositions.set(entity, { ...trans.position });
    drag.originalScales.set(entity, { ...trans.scale });
    const moveEdge = followerDrag.moveEdge;
    drag.followerEdges.set(entity, moveEdge);

    if (moveEdge && moveEdge !== 'all') {
      // compute fixed edge position (the edge that stays in place)
      if (moveEdge === 'left') {
        drag.fixedEdgePositions.set(entity, trans.position.x + trans.scale.x * 0.5);
      } else if (moveEdge === 'right') {
        drag.fixedEdgePositions.set(entity, trans.position.x - trans.scale.x * 0.5);
      } else if (moveEdge === 'top') {
        drag.fixedEdgePositions.set(entity, trans.position.y + trans.scale.y * 0.5);
      } else if (moveEdge === 'bottom') {
        drag.fixedEdgePositions.set(entity, trans.position.y - trans.scale.y * 0.5);
      }
    }
  }

  activeDrags.set(parentEntity, drag);
}

function UpdateDrags() {
  const world = getWorld();
  const toRemove: Entity[] = [];

  for (const [entity, drag] of activeDrags) {
    if (!IsActionHeld('select_object')) {
      toRemove.push(entity);
      continue;
    }

    const mouse = Input.MousePos;
    const rawDeltaX = mouse.x - drag.lastMousePos.x;
    const rawDeltaY = mouse.y - drag.lastMousePos.y;
    drag.lastMousePos = { x: mouse.x, y: mouse.y };

    if (Math.abs(rawDeltaX) < 0.001 && Math.abs(rawDeltaY) < 0.001) continue;

    const rule = drag.rule;
    let amountX = rawDeltaX * rule.sensitivity;
    let amountY = rawDeltaY * rule.sensitivity;
    if (rule.snapEnabled && rule.snapValue > 0) {
      amountX = Math.round(amountX / rule.snapValue) * rule.snapValue;
      amountY = Math.round(amountY / rule.snapValue) * rule.snapValue;
    }

    // Apply axis constraint
    if (rule.axisConstraint === 'X') { amountY = 0; }
    else if (rule.axisConstraint === 'Y') { amountX = 0; }
    // XY keeps both

    const parentTrans = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (!parentTrans) continue;

    const origPos = drag.originalPositions.get(entity)!;
    let newX = parentTrans.position.x + amountX;
    let newY = parentTrans.position.y + amountY;
    if (!isNaN(drag.minX)) newX = Math.max(newX, drag.minX);
    if (!isNaN(drag.maxX)) newX = Math.min(newX, drag.maxX);

    parentTrans.position = { x: newX, y: newY, z: parentTrans.position.z };
    world.setComponent(entity, parentTrans);

    const actualDeltaX = parentTrans.position.x - origPos.x;
    const actualDeltaY = parentTrans.position.y - origPos.y;

    // Update followers
    for (const [followerEntity, edge] of drag.followerEdges) {
      const trans = world.getComponent<TransformComponent>(followerEntity, 'TransformComponent');
      if (!trans) continue;
      const origFwdPos = drag.originalPositions.get(followerEntity)!;
      const origFwdScale = drag.originalScales.get(followerEntity)!;

      if (edge === 'all') {
        trans.position = {
          x: origFwdPos.x + actualDeltaX,
          y: origFwdPos.y + actualDeltaY,
          z: trans.position.z
        };
      } else {
        const fixedEdge = drag.fixedEdgePositions.get(followerEntity)!;
        // Call helper to adjust position and scale based on moving parent edge and fixed follower edge
        adjustEdgeFromParent(trans, origFwdPos, origFwdScale, parentTrans.position, drag.originalScales.get(entity)!, edge, fixedEdge);
      }
      world.setComponent(followerEntity, trans);
    }
  }

  for (const e of toRemove) activeDrags.delete(e);
}

function adjustEdgeFromParent(
  follower: TransformComponent,
  origPos: { x: number; y: number; z: number },
  origScale: { x: number; y: number; z: number },
  parentPos: { x: number; y: number; z: number },
  parentScale: { x: number; y: number; z: number },
  edge: string,
  fixedEdgePosition: number
) {
  if (edge === 'left' || edge === 'right') {
    const parentAttachEdge = (edge === 'left')
      ? parentPos.x + parentScale.x * 0.5
      : parentPos.x - parentScale.x * 0.5;
    const newWidth = Math.abs(parentAttachEdge - fixedEdgePosition);
    const newCenter = (parentAttachEdge + fixedEdgePosition) * 0.5;
    follower.scale.x = Math.max(1, newWidth);
    follower.position.x = newCenter;
  } else if (edge === 'top' || edge === 'bottom') {
    const parentAttachEdge = (edge === 'top')
      ? parentPos.y + parentScale.y * 0.5
      : parentPos.y - parentScale.y * 0.5;
    const newHeight = Math.abs(parentAttachEdge - fixedEdgePosition);
    const newCenter = (parentAttachEdge + fixedEdgePosition) * 0.5;
    follower.scale.y = Math.max(1, newHeight);
    follower.position.y = newCenter;
  }
}

registerSystemMethod('SETUE.Controls.Movement', 'Load', Load);
registerSystemMethod('SETUE.Controls.Movement', 'UpdateDrags', UpdateDrags);
