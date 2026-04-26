import { registerSystemMethod } from './Core/Scheduler.js';
export const Input = {
  keys: {} as Record<string, boolean>,
  processKeyboardEvent(e: KeyboardEvent) { this.keys[e.code] = (e.type === 'keydown'); },
  processMouseEvent(e: MouseEvent) {},
  endFrame() {},
  flush() {},
};
function Load() { console.log('[Input] Loaded'); }
function Flush() { Input.endFrame(); }
registerSystemMethod('SETUE.Controls.Input', 'Load', Load);
registerSystemMethod('SETUE.Controls.Input', 'Flush', Flush);
