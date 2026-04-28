// convert-csv-to-json.js
// Usage: node convert-csv-to-json.js
//
// Reads all CSV files used by the engine and produces a single `base-world.json`.

const fs = require('fs');
const path = require('path');

function parseCsvArray(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const row = {};
    const cols = [];
    let cur = '', quoted = false;
    for (const ch of lines[i]) {
      if (ch === '"') { quoted = !quoted; }
      else if (ch === ',' && !quoted) { cols.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur.trim());
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] || '';
    }
    result.push(row);
  }
  return result;
}

function parseSettingsCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return {};
  const settings = {};
  for (let i = 1; i < lines.length; i++) {
    const [key, ...rest] = lines[i].split(',');
    if (!key) continue;
    settings[key.trim()] = rest.join(',').trim();
  }
  return settings;
}

const baseWorld = {};

function addCsv(relPath, key, type = 'array') {
  const fullPath = path.join(__dirname, relPath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[convert] File not found: ${relPath}`);
    return;
  }
  const text = fs.readFileSync(fullPath, 'utf-8');
  if (type === 'array') baseWorld[key] = parseCsvArray(text);
  else if (type === 'settings') baseWorld[key] = parseSettingsCsv(text);
}

// ALL CSVs used by the engine
addCsv('Ui/Panel.csv', 'panels');
addCsv('Ui/Text.csv', 'texts');
addCsv('Ui/Color.csv', 'colors');
addCsv('Ui/Font.csv', 'fonts');
addCsv('Controls/Selection.csv', 'selection');
addCsv('Controls/Input.csv', 'input');
addCsv('Controls/Movement.csv', 'movement');
addCsv('Controls/Camera.csv', 'camera', 'array');
addCsv('Ui/Scene2D.csv', 'scene2d');
addCsv('Core/Scheduler.csv', 'scheduler');
addCsv('Core/MasterClock.csv', 'masterclock', 'settings');
addCsv('Window.csv', 'window', 'settings');   // <-- THIS IS THE KEY LINE

fs.writeFileSync(path.join(__dirname, 'base-world.json'), JSON.stringify(baseWorld, null, 2));
console.log('[convert] base-world.json written successfully.');
console.log('[convert] Sections:', Object.keys(baseWorld).join(', '));
