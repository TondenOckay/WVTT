// Rule Systems/SRDd20.ts
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { parseCsvArray } from '../parseCsv.js';
import { IComponent, TextComponent } from '../Core/ECS.js';

// ---------- component interfaces (also add these in ECS.ts) ----------
export interface SheetFieldComponent extends IComponent {
  type: 'SheetFieldComponent';
  fieldName: string;
  characterId: number;   // entity index of the character
}

export interface CharacterMarkerComponent extends IComponent {
  type: 'CharacterMarkerComponent';
  characterId: number;
}

// ---------- per‑character data store ----------
const characterData = new Map<number, Map<string, number>>();

// ---------- formula storage ----------
interface Formula {
  operands: string[];
  operators: string[];
}
const formulas = new Map<string, Formula>();

/**
 * Evaluate a single operand – either a numeric constant or a field name.
 */
function evaluateOperand(characterId: number, operand: string): number {
  const num = parseFloat(operand);
  if (!isNaN(num)) return num;
  return getFieldValue(characterId, operand);
}

/**
 * Compute the current value of a named field for a given character.
 */
function getFieldValue(characterId: number, fieldName: string): number {
  const charData = characterData.get(characterId);
  if (!charData) return 0;

  const formula = formulas.get(fieldName);
  if (!formula || formula.operands.length === 0) {
    return charData.get(fieldName) ?? 0;
  }

  // Evaluate left to right
  let result = evaluateOperand(characterId, formula.operands[0]);
  for (let i = 0; i < formula.operators.length; i++) {
    const right = evaluateOperand(characterId, formula.operands[i + 1]);
    switch (formula.operators[i]) {
      case '+': result += right; break;
      case '-': result -= right; break;
      case '*': result *= right; break;
      case '/': result /= right; break;
      default: break;
    }
  }
  return result;
}

/**
 * Set a base field value (no formula). Derived fields update automatically.
 */
export function setCharacterField(characterId: number, fieldName: string, value: number): void {
  if (!characterData.has(characterId)) {
    characterData.set(characterId, new Map());
  }
  characterData.get(characterId)!.set(fieldName, value);
}

// ---------- system methods ----------

async function Load() {
  // Updated path – the CSV lives right next to this file
  const response = await fetch('Rule Systems/SRDd20.csv');
  const csvText = await response.text();
  const rows = parseCsvArray(csvText);

  formulas.clear();
  for (const row of rows) {
    const field = row['field_name'];
    if (!field) continue;

    const operands: string[] = [];
    const operators: string[] = [];

    for (let i = 1; i <= 3; i++) {
      const operand = row[`operand_${i}`];
      const op = row[`op_${i}`];
      if (operand && operand.trim() !== '' && op && op.trim() !== '') {
        operands.push(operand.trim());
        operators.push(op.trim());
      }
    }

    if (operands.length > 0) {
      formulas.set(field, { operands, operators });
    }
  }

  console.log(`[SRDd20] Loaded ${formulas.size} formulas`);
}

function Update() {
  const world = getWorld();

  // Update every panel that is bound to a field
  world.forEachIndex2<SheetFieldComponent, TextComponent>(
    'SheetFieldComponent',
    'TextComponent',
    (idx, fieldComp, textComp) => {
      const value = getFieldValue(fieldComp.characterId, fieldComp.fieldName);
      // Update the displayed text (round if whole number, else 2 decimals)
      textComp.contentId = Number.isInteger(value) ? value.toString() : value.toFixed(2);
    }
  );
}

// ---------- register with the scheduler ----------
// We use a unique name so other rule systems can be registered independently
registerSystemMethod('SETUE.RuleSystems.SRDd20', 'Load', Load);
registerSystemMethod('SETUE.RuleSystems.SRDd20', 'Update', Update);
