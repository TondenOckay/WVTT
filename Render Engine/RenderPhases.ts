// RenderPhases.ts
import { parseCsvArray } from './parseCsv.js';
import { registerSystemMethod } from './Core/Scheduler.js';
import * as PIXI from 'pixi.js';

let stage: PIXI.Container | null = null;
let uiContainer: PIXI.Container | null = null;
let textContainer: PIXI.Container | null = null;

export function setRenderContainers(
  mainStage: PIXI.Container,
  uiLayer: PIXI.Container,
  textLayer: PIXI.Container
) {
  stage = mainStage;
  uiContainer = uiLayer;
  textContainer = textLayer;
}

interface PhaseDef {
  PhaseId: number;
  CommandName: string;
  DependencyId: number;
  Enabled: boolean;
}

let phases: PhaseDef[] = [];

async function Load() {
  const response = await fetch('RenderPhases.csv');
  if (!response.ok) {
    console.warn('[RenderPhases] RenderPhases.csv not found');
    return;
  }
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

  console.log(`[RenderPhases] Loaded ${phases.length} phases`);
}

function Update() {
  for (const phase of phases) {
    switch (phase.CommandName) {
      case 'Begin_Frame':
        // PixiJS ticker handles this
        break;
      case 'Draw_Meshes':
        // Placeholder for 3D meshes
        break;
      case 'Draw_UI':
        if (uiContainer && stage) {
          stage.setChildIndex(uiContainer, stage.children.length - 1);
        }
        break;
      case 'Draw_Text':
        if (textContainer && stage) {
          stage.setChildIndex(textContainer, stage.children.length - 1);
        }
        break;
      case 'End_Frame':
        // Finalisation
        break;
      default:
        break;
    }
  }
}

registerSystemMethod('SETUE.RenderPhases', 'Load', Load);
registerSystemMethod('SETUE.RenderPhases', 'Update', Update);
