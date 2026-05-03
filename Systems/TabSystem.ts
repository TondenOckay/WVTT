// Systems/TabSystem.ts – consumes TabSwitch events, toggles Visible + Selected tags,
//                        rebuilds spatial index after visibility changes
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { areaToPanels, updateSpatialIndex } from '../Ui/Panel.js';
import { popAllUIEvents } from '../Controls/Input.js';
import { NavButtonComponent, Entity } from '../Core/ECS.js';

let selectedButtonId: number | null = null;

function Update() {
  const events = popAllUIEvents();
  const world = getWorld();

  if (events.length === 0) return;

  let changed = false;

  for (const evt of events) {
    if (evt.kind !== 'TabSwitch') continue;

    const newButtonId = evt.data.entityId;
    const navComp = world.getComponentByIndex<NavButtonComponent>(newButtonId, 'NavButton');
    if (!navComp) continue;

    // Deselect old
    if (selectedButtonId !== null) {
      world.removeTag(
        new Entity(selectedButtonId, world.generations[selectedButtonId]),
        'Selected'
      );
      const oldNav = world.getComponentByIndex<NavButtonComponent>(selectedButtonId, 'NavButton');
      if (oldNav) {
        const oldPanels = areaToPanels.get(oldNav.area) ?? [];
        for (const panelId of oldPanels) {
          world.removeTag(new Entity(panelId, world.generations[panelId]), 'Visible');
        }
      }
    }

    // Select new
    world.addTag(new Entity(newButtonId, world.generations[newButtonId]), 'Selected');
    selectedButtonId = newButtonId;

    // Show new area's panels
    const newPanels = areaToPanels.get(navComp.area) ?? [];
    for (const panelId of newPanels) {
      world.addTag(new Entity(panelId, world.generations[panelId]), 'Visible');
    }

    changed = true;
  }

  // After toggling visibility, EXECUTE commands so that addTag/removeTag take effect,
  // then rebuild the spatial index so the newly visible panels are hittable.
  if (changed) {
    world.executeCommands();
    updateSpatialIndex();
  }
}

registerSystemMethod('SETUE.Systems.TabSystem', 'Update', Update);
