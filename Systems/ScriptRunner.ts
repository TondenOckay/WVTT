// Systems/ScriptRunner.ts
type ScriptFn = (payload?: any) => void;
const scriptRegistry = new Map<string, ScriptFn>();

export function registerScript(name: string, fn: ScriptFn) {
  scriptRegistry.set(name, fn);
}

export function runScript(name: string, payload?: any) {
  const fn = scriptRegistry.get(name);
  if (fn) {
    fn(payload);
  } else {
    console.warn(`[ScriptRunner] Script "${name}" not registered`);
  }
}
