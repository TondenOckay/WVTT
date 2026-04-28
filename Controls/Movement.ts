// Controls/Movement.ts
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input } from './Input.js';
import { panelEntities } from '../Ui/Panel.js';
import { TransformComponent, DragComponent } from '../Core/ECS.js';
import { parseCsvArray } from '../parseCsv.js';
import type { Entity } from '../Core/ECS.js';

interface MovementRule {
  id: string;
  axisConstraint: string;
  snapEnabled: boolean;
  snapValue: number;
  sensitivity: number;
}

const rules = new Map<string, MovementRule>();

interface ActiveDrag {
  lastMousePos: {x:number;y:number};
  parentEntity: Entity;
  rule: MovementRule;
  minX: number;
  maxX: number;
  followerEdges: Map<Entity, string>;
  originalPositions: Map<Entity, {x:number;y:number;z:number}>;
  originalScales:  Map<Entity, {x:number;y:number;z:number}>;
  fixedEdgePositions: Map<Entity, number>;
}

const activeDrags = new Map<Entity, ActiveDrag>();

async function Load() {
  const response = await fetch('Controls/Movement.csv');
  const text = await response.text();
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
      sensitivity: parseFloat(row['sensitivity'] ?? '1'),
    });
  }
  console.log(`[Movement] Loaded ${rules.size} rules`);
}

export function RuleExists(ruleId: string) { return rules.has(ruleId); }

export function StartDrag(panelName: string, mousePos: {x:number;y:number}, ruleId: string) {
  const world = getWorld();
  const parentEntity = panelEntities.get(panelName);
  if (!parentEntity) return;
  const dragComp = world.getComponent<DragComponent>(parentEntity, 'DragComponent');
  if (!dragComp) return;
  const rule = rules.get(ruleId); if (!rule) return;
  const parentTrans = world.getComponent<TransformComponent>(parentEntity, 'TransformComponent');
  if (!parentTrans) return;

  const drag: ActiveDrag = {
    lastMousePos: {...mousePos},
    parentEntity,
    rule,
    minX: dragComp.minX??NaN, maxX: dragComp.maxX??NaN,
    followerEdges: new Map(),
    originalPositions: new Map(),
    originalScales: new Map(),
    fixedEdgePositions: new Map()
  };

  drag.originalPositions.set(parentEntity, {...parentTrans.position});
  drag.originalScales.set(parentEntity, {...parentTrans.scale});

  for (const [name, entity] of panelEntities) {
    if (entity === parentEntity) continue;
    const fwd = world.getComponent<DragComponent>(entity, 'DragComponent');
    if (!fwd || fwd.parentNameId !== panelName) continue;
    const trans = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (!trans) continue;

    drag.originalPositions.set(entity, {...trans.position});
    drag.originalScales.set(entity, {...trans.scale});
    const edge = fwd.moveEdge;
    drag.followerEdges.set(entity, edge);

    if (edge && edge !== 'all') {
      let fixedPos: number;
      if (edge === 'left')      fixedPos = trans.position.x + trans.scale.x*0.5;
      else if (edge === 'right')  fixedPos = trans.position.x - trans.scale.x*0.5;
      else if (edge === 'top')    fixedPos = trans.position.y + trans.scale.y*0.5;
      else if (edge === 'bottom') fixedPos = trans.position.y - trans.scale.y*0.5;
      else fixedPos = 0;
      drag.fixedEdgePositions.set(entity, fixedPos);
    }
  }

  activeDrags.set(parentEntity, drag);
}

function UpdateDrags() {
  const world = getWorld();
  const toRemove: Entity[] = [];
  for (const [entity, drag] of activeDrags) {
    if (!Input._held.has('MouseLeft')) { toRemove.push(entity); continue; }

    const mouse = Input.MousePos;
    const rawDeltaX = mouse.x - drag.lastMousePos.x;
    const rawDeltaY = mouse.y - drag.lastMousePos.y;
    drag.lastMousePos = {x:mouse.x, y:mouse.y};
    if (Math.abs(rawDeltaX) < 0.001 && Math.abs(rawDeltaY) < 0.001) continue;

    const rule = drag.rule;
    let amountX = rawDeltaX * rule.sensitivity;
    let amountY = rawDeltaY * rule.sensitivity;
    if (rule.snapEnabled && rule.snapValue>0) {
      amountX = Math.round(amountX / rule.snapValue) * rule.snapValue;
      amountY = Math.round(amountY / rule.snapValue) * rule.snapValue;
    }
    if (rule.axisConstraint === 'X') amountY = 0;
    else if (rule.axisConstraint === 'Y') amountX = 0;

    const parentTrans = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (!parentTrans) continue;
    const origParentPos = drag.originalPositions.get(entity)!;

    let newX = parentTrans.position.x + amountX;
    let newY = parentTrans.position.y + amountY;
    if (!isNaN(drag.minX)) newX = Math.max(newX, drag.minX);
    if (!isNaN(drag.maxX)) newX = Math.min(newX, drag.maxX);

    parentTrans.position = {x:newX, y:newY, z:parentTrans.position.z};
    world.setComponent(entity, parentTrans);

    for (const [followerEntity, edge] of drag.followerEdges) {
      const trans = world.getComponent<TransformComponent>(followerEntity, 'TransformComponent');
      if (!trans) continue;
      const origFwdPos = drag.originalPositions.get(followerEntity)!;
      const origFwdScale = drag.originalScales.get(followerEntity)!;

      if (edge === 'all') {
        const deltaX = parentTrans.position.x - origParentPos.x;
        const deltaY = parentTrans.position.y - origParentPos.y;
        trans.position = { x:origFwdPos.x+deltaX, y:origFwdPos.y+deltaY, z:trans.position.z };
      } else {
        const fixedPos = drag.fixedEdgePositions.get(followerEntity)!;
        adjustEdgeFromParent(trans, origFwdPos, origFwdScale, parentTrans.position, drag.originalScales.get(entity)!, edge, fixedPos);
      }
      world.setComponent(followerEntity, trans);
    }
  }
  for (const e of toRemove) activeDrags.delete(e);
}

function adjustEdgeFromParent(
  follower: TransformComponent,
  origPos: {x:number;y:number;z:number}, origScale: {x:number;y:number;z:number},
  parentPos: {x:number;y:number;z:number}, parentScale: {x:number;y:number;z:number},
  edge: string, fixedEdgePosition: number
) {
  if (edge === 'left' || edge === 'right') {
    const parentAttachEdge = (edge === 'left')
      ? parentPos.x + parentScale.x*0.5
      : parentPos.x - parentScale.x*0.5;
    const newWidth = Math.abs(parentAttachEdge - fixedEdgePosition);
    const newCenter = (parentAttachEdge + fixedEdgePosition)*0.5;
    follower.scale.x = Math.max(1, newWidth);
    follower.position.x = newCenter;
  } else if (edge === 'top' || edge === 'bottom') {
    const parentAttachEdge = (edge === 'top')
      ? parentPos.y + parentScale.y*0.5
      : parentPos.y - parentScale.y*0.5;
    const newHeight = Math.abs(parentAttachEdge - fixedEdgePosition);
    const newCenter = (parentAttachEdge + fixedEdgePosition)*0.5;
    follower.scale.y = Math.max(1, newHeight);
    follower.position.y = newCenter;
  }
}

registerSystemMethod('SETUE.Controls.Movement', 'Load', Load);
registerSystemMethod('SETUE.Controls.Movement', 'UpdateDrags', UpdateDrags);
