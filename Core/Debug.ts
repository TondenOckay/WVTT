import { registerSystemMethod } from './Scheduler.js';
function Load() { console.log('[Debug] Loaded'); }
registerSystemMethod('SETUE.Core.Debug', 'Load', Load);
