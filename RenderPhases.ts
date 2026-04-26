import { registerSystemMethod } from './Core/Scheduler.js';
function Load() { console.log('[RenderPhases] Loaded'); }
function Update() { /* layer ordering later */ }
registerSystemMethod('SETUE.RenderPhases', 'Load', Load);
registerSystemMethod('SETUE.RenderPhases', 'Update', Update);
