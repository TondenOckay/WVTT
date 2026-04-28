// Systems/ScriptRunner.ts
const scriptRegistry = new Map<string, () => void>();

export function registerScript(name: string, fn: () => void) {
  scriptRegistry.set(name, fn);
}

export function runScript(name: string) {
  const fn = scriptRegistry.get(name);
  if (fn) {
    fn();
  } else {
    console.warn(`[ScriptRunner] Script "${name}" not registered`);
  }
}
