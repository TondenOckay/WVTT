// src/Core/SchedulerValidator.ts
import { parseCsvArray } from '../parseCsv.js';
import { SchedulerEntry } from './Scheduler.js';

interface ValidationRule {
  type: 'class' | 'method';
  className: string;
  methodName: string;
  methodKind: string; // 'Load' or 'Update'
  enabled: boolean;
}

export async function validateFromCSV(
  entries: SchedulerEntry[],
  csvPath = 'Core/SchedulerValidation.csv'
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const response = await fetch(csvPath);
  const text = await response.text();
  const rules = parseCsvArray(text) as any[];

  for (const rule of rules) {
    if (rule['Enabled'] !== '1') continue;

    if (rule['Type'] === 'class') {
      const className = rule['ClassName'];
      if (!className) continue;
      const exists = entries.some(e => e.ClassName === className && e.Enabled);
      if (!exists) {
        errors.push(`Required class missing or disabled: ${className}`);
      }
    } else if (rule['Type'] === 'method') {
      const className = rule['ClassName'];
      const methodName = rule['MethodName'];
      const methodKind = rule['MethodKind']; // 'Load' or 'Update'
      if (!className || !methodName) continue;

      const exists = entries.some(e => {
        if (e.ClassName !== className) return false;
        if (!e.Enabled) return false;
        if (methodKind === 'Load') return e.LoadMethod === methodName && e.Loop === 'Boot';
        if (methodKind === 'Update') return e.UpdateMethod === methodName && e.Loop !== 'Boot';
        return false;
      });
      if (!exists) {
        errors.push(`Required ${methodKind.toLowerCase()} method missing: ${className}.${methodName}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
