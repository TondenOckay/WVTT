// Ui/Dropdown.ts
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { panelEntities } from './Panel.js';
import { parseCsvArray } from '../parseCsv.js';
import { runScript } from '../Systems/ScriptRunner.js';
import {
  Entity,
  PanelComponent,
  MaterialComponent,
  TransformComponent,
  TextComponent,
  SelectableComponent,
} from '../Core/ECS.js';

interface DropdownDef {
  id: string;
  parentPanel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataSource: string;
  dataColumn: string;
  onSelectAction: string;
}

const dropdowns: Map<string, {
  def: DropdownDef;
  headerEntity: Entity;
  optionsEntity: Entity | null;
  options: string[];
  isOpen: boolean;
}> = new Map();

async function Load() {
  const response = await fetch('Ui/Dropdown.csv');
  const text = await response.text();
  const rows = parseCsvArray(text);

  for (const row of rows) {
    if (!row['dropdown_id']) continue;
    const def: DropdownDef = {
      id: row['dropdown_id'],
      parentPanel: row['parent_panel'] ?? '',
      x: parseFloat(row['pos_x'] ?? '0'),
      y: parseFloat(row['pos_y'] ?? '0'),
      width: parseFloat(row['width'] ?? '200'),
      height: parseFloat(row['height'] ?? '30'),
      dataSource: row['data_source'] ?? '',
      dataColumn: row['data_column'] ?? '',
      onSelectAction: row['on_select_action'] ?? '',
    };

    // Load the options from the data-source CSV
    let options: string[] = [];
    try {
      const res = await fetch(def.dataSource);
      const csvText = await res.text();
      const dataRows = parseCsvArray(csvText);
      options = dataRows.map(r => r[def.dataColumn] ?? '').filter(Boolean);
    } catch (e) {
      console.warn(`[Dropdown] Could not load options for ${def.id}: ${e}`);
    }

    // Create the dropdown header (the always‑visible part)
    const world = getWorld();
    const parentEntity = panelEntities.get(def.parentPanel);
    if (!parentEntity) {
      console.warn(`[Dropdown] Parent panel "${def.parentPanel}" not found.`);
      continue;
    }

    // Header entity – a clickable panel that shows the current selection
    const headerEntity = world.createEntity();
    world.addComponent<TransformComponent>(headerEntity, {
      type: 'TransformComponent',
      position: { x: def.x + def.width/2, y: def.y + def.height/2, z: 0 },
      scale: { x: def.width, y: def.height, z: 1 },
    });
    world.addComponent<PanelComponent>(headerEntity, {
      type: 'PanelComponent',
      visible: true,
      layer: 20,
      clickable: true,
      alpha: 1,
    });
    world.addComponent<MaterialComponent>(headerEntity, {
      type: 'MaterialComponent',
      color: { r: 0.2, g: 0.2, b: 0.3, a: 1 },
    });
    world.addComponent<TextComponent>(headerEntity, {
      type: 'TextComponent',
      contentId: options[0] ?? '-- select --',
      fontId: 'default',
      fontSize: 14,
      color: { r: 1, g: 1, b: 1, a: 1 },
      align: 'center',
      vAlign: 'middle',
    });
    world.addComponent<SelectableComponent>(headerEntity, {
      type: 'SelectableComponent',
      clickable: true,
      visible: true,
      layer: 20,
    });

    panelEntities.set(`dropdown_${def.id}_header`, headerEntity);

    dropdowns.set(def.id, { def, headerEntity, optionsEntity: null, options, isOpen: false });

    // Register click on header → toggle open/close
    // We'll wire that in Update.
  }

  console.log(`[Dropdown] Loaded ${dropdowns.size} dropdowns`);
}

function Update() {
  const world = getWorld();
  dropdowns.forEach((dd, id) => {
    // Toggle logic: detect click on header entity
    // (we would normally use the Selection system; for now we rely on the header having an attached action)
    // This part will be completed by the existing Selection.csv rule that calls a toggle script.
  });
}

// Called from Actions.csv when a dropdown header is clicked
export function toggleDropdown(dropdownId: string) {
  const dd = dropdowns.get(dropdownId);
  if (!dd) return;
  const world = getWorld();

  if (dd.isOpen) {
    // Close: destroy the options panel
    if (dd.optionsEntity) {
      world.destroyEntity(dd.optionsEntity);
      dd.optionsEntity = null;
    }
    dd.isOpen = false;
  } else {
    // Open: create a panel with all options
    const headerTransform = world.getComponent<TransformComponent>(dd.headerEntity, 'TransformComponent');
    if (!headerTransform) return;

    const optionHeight = dd.def.height;
    const panelEntity = world.createEntity();
    world.addComponent<TransformComponent>(panelEntity, {
      type: 'TransformComponent',
      position: { x: headerTransform.position.x, y: headerTransform.position.y + optionHeight, z: 0 },
      scale: { x: dd.def.width, y: dd.options.length * optionHeight, z: 1 },
    });
    world.addComponent<PanelComponent>(panelEntity, {
      type: 'PanelComponent',
      visible: true,
      layer: 25,
      clickable: false,
      alpha: 1,
    });
    world.addComponent<MaterialComponent>(panelEntity, {
      type: 'MaterialComponent',
      color: { r: 0.15, g: 0.15, b: 0.2, a: 1 },
    });
    dd.optionsEntity = panelEntity;

    dd.options.forEach((opt, idx) => {
      const optEntity = world.createEntity();
      world.addComponent<TransformComponent>(optEntity, {
        type: 'TransformComponent',
        position: { x: headerTransform.position.x, y: headerTransform.position.y + (idx+1) * optionHeight, z: 0 },
        scale: { x: dd.def.width, y: optionHeight, z: 1 },
      });
      world.addComponent<PanelComponent>(optEntity, {
        type: 'PanelComponent',
        visible: true,
        layer: 26,
        clickable: true,
        alpha: 1,
      });
      world.addComponent<MaterialComponent>(optEntity, {
        type: 'MaterialComponent',
        color: { r: 0.3, g: 0.3, b: 0.4, a: 1 },
      });
      world.addComponent<TextComponent>(optEntity, {
        type: 'TextComponent',
        contentId: opt,
        fontId: 'default',
        fontSize: 14,
        color: { r: 1, g: 1, b: 1, a: 1 },
        align: 'center',
        vAlign: 'middle',
      });
      world.addComponent<SelectableComponent>(optEntity, {
        type: 'SelectableComponent',
        clickable: true,
        visible: true,
        layer: 26,
      });

      // Store which dropdown and option this is (using a simple mapping)
      panelEntities.set(`dropdown_${dd.def.id}_option_${idx}`, optEntity);
    });
    dd.isOpen = true;
  }
}

registerSystemMethod('SETUE.Systems.Dropdown', 'Load', Load);
registerSystemMethod('SETUE.Systems.Dropdown', 'Update', Update);
