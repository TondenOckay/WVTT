// src/RenderPhases.ts
import { parseCsvArray } from './parseCsv.js';
import { registerSystemMethod } from './Core/Scheduler.js';
import * as PIXI from 'pixi.js';

// We'll need a reference to the stage and maybe a dedicated "UI layer" container.
// These can be set during boot.
let stage: PIXI.Container | null = null;
let uiContainer: PIXI.Container | null = null;
let textContainer: PIXI.Container | null = null;

// You can set these up from outside (e.g., after creating the Application in Window.ts)
export function setRenderContainers(
  mainStage: PIXI.Container,
  uiLayer: PIXI.Container,
  textLayer: PIXI.Container
) {
  stage = mainStage;
  uiContainer = uiLayer;
  textContainer = textLayer;
}

// ---- Phase definitions (just like the Vulkan version) ----

interface PhaseDef {
  PhaseId: number;
  CommandName: string;
  DependencyId: number; // 0 or None resolved to 0
  Enabled: boolean;
}

let phases: PhaseDef[] = [];

async function Load() {
  const response = await fetch('RenderPhases.csv');
  const csvText = await response.text();
  const rows = parseCsvArray(csvText);

  phases = rows
    .filter(r => r['Enabled']?.toLowerCase() === 'true')
    .map(r => ({
      PhaseId: parseInt(r['PhaseId'] || '0'),
      CommandName: r['CommandName'] || '',
      DependencyId: r['DependencyId'] && r['DependencyId'] !== 'None' ? parseInt(r['DependencyId']) : 0,
      Enabled: true,
    }))
    .sort((a, b) => a.PhaseId - b.PhaseId);
}

function Update() {
  // In a 2D PixiJS engine, draw order is mostly handled by the display list.
  // But we can still execute custom logic for each phase if needed.
  for (const phase of phases) {
    switch (phase.CommandName) {
      case 'Begin_Frame':
        // PixiJS handles this automatically via the ticker – nothing to do.
        break;
      case 'Draw_Meshes':
        // In a 2D UI engine, there are no 3D meshes. Could be a placeholder for future 3D.
        break;
      case 'Draw_UI':
        // Ensure the UI container is on top, etc.
        if (uiContainer && stage) {
          stage.setChildIndex(uiContainer, stage.children.length - 1);
        }
        break;
      case 'Draw_Text':
        // Ensure text is rendered above UI panels.
        if (textContainer && stage) {
          stage.setChildIndex(textContainer, stage.children.length - 1);
        }
        break;
      case 'End_Frame':
        // Finalisation – nothing needed.
        break;
      default:
        // Unknown phase – you can call a registered custom function later.
        break;
    }
  }
}

// Register with Scheduler
registerSystemMethod('SETUE.RenderPhases', 'Load', Load);
registerSystemMethod('SETUE.RenderPhases', 'Update', Update);
