// Systems/TabSystem.ts – consumes TabSwitch events, toggles Visible + Selected tags
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { areaToPanels } from '../Ui/Panel.js';
import { popAllUIEvents } from '../Controls/Input.js';
import { NavButtonComponent, Entity } from '../Core/ECS.js';

let selectedButtonId: number | null = null;

function Update() {
  console.log('[TabSystem] Update running');

  const events = popAllUIEvents();
  const world = getWorld();

  if (events.length > 0) {
    console.log(`[TabSystem] Received ${events.length} events:`, JSON.stringify(events));
  }

  for (const evt of events) {
    if (evt.kind !== 'TabSwitch') continue;

    const newButtonId = evt.data.entityId;
    console.log(`[TabSystem] Processing TabSwitch event for entityId=${newButtonId}, areaName=${evt.data.areaName}`);

    const navComp = world.getComponentByIndex<NavButtonComponent>(newButtonId, 'NavButton');
    if (!navComp) {
      console.warn(`[TabSystem] Entity ${newButtonId} has no NavButton component`);
      continue;
    }
    console.log(`[TabSystem] NavButton area = "${navComp.area}"`);

    // Deselect old button
    if (selectedButtonId !== null) {
      console.log(`[TabSystem] Deselecting old button entity ${selectedButtonId}`);
      world.removeTag(
        new Entity(selectedButtonId, world.generations[selectedButtonId]),
        'Selected'
      );
      const oldNav = world.getComponentByIndex<NavButtonComponent>(selectedButtonId, 'NavButton');
      if (oldNav) {
        const oldPanels = areaToPanels.get(oldNav.area) ?? [];
        console.log(`[TabSystem] Hiding ${oldPanels.length} panels of area "${oldNav.area}"`);
        for (const panelId of oldPanels) {
          world.removeTag(
            new Entity(panelId, world.generations[panelId]),
            'Visible'
          );
        }
      }
    } else {
      console.log('[TabSystem] No previously selected button');
    }

    // Select new button
    console.log(`[TabSystem] Selecting new button entity ${newButtonId}`);
    world.addTag(
      new Entity(newButtonId, world.generations[newButtonId]),
      'Selected'
    );
    selectedButtonId = newButtonId;

    // Show new area’s panels
    const newPanels = areaToPanels.get(navComp.area) ?? [];
    console.log(`[TabSystem] Showing ${newPanels.length} panels of area "${navComp.area}"`);
    for (const panelId of newPanels) {
      world.addTag(
        new Entity(panelId, world.generations[panelId]),
        'Visible'
      );
    }
  }
}

registerSystemMethod('SETUE.Systems.TabSystem', 'Update', Update);
