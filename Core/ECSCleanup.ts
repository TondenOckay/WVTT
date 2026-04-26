import { registerSystemMethod } from './Scheduler.js';
function Execute() { /* no ECS world yet */ }
registerSystemMethod('SETUE.Core.ECSCleanup', 'Execute', Execute);
