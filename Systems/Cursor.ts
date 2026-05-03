// Systems/Cursor.ts – exports hovered object name + entity index
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input } from '../Controls/Input.js';
import { hitTestPanel, panelEntities } from '../Ui/Panel.js';
import { CursorState, Entity } from '../Core/ECS.js';

export let hoveredEntityId: number | null = null;
export let hoveredObjectName: string | null = null;

let cursorEntity: Entity | null = null;

async function Load() {
  const world = getWorld();
  cursorEntity = world.createEntity();
  world.addComponent<CursorState>(cursorEntity, {
    type: 'CursorState',
    entityId: null,
    mouseX: 0,
    mouseY: 0,
  });
}

function Update() {
  const world = getWorld();
  const mouse = Input.MousePos;

  const name = hitTestPanel(mouse.x, mouse.y);
  hoveredObjectName = name;

  if (name) {
    const entity = panelEntities.get(name);
    hoveredEntityId = entity ? entity.index : null;
  } else {
    hoveredEntityId = null;
  }

  if (cursorEntity) {
    const state = world.getComponent<CursorState>(cursorEntity, 'CursorState');
    if (state) {
      state.entityId = hoveredEntityId;
      state.mouseX = mouse.x;
      state.mouseY = mouse.y;
      world.setComponent(cursorEntity, state);
    }
  }
}

registerSystemMethod('SETUE.Systems.Cursor', 'Load', Load);
registerSystemMethod('SETUE.Systems.Cursor', 'Update', Update);
