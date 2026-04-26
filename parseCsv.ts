// parseCsv.ts – Generic CSV parsers for the data‑driven engine

// ---------- Simple key‑value CSV (like Window.csv) ----------
export interface SettingsRecord {
  [key: string]: string | number | boolean;
}

export function parseSettingsCsv(csvText: string): SettingsRecord {
  const lines = csvText.trim().split('\n');
  const settings: SettingsRecord = {};

  // Assume first line is header "Setting,Value", skip it
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const [key, ...rest] = trimmed.split(',');
    if (!key) continue;
    const value = rest.join(',').trim();
    settings[key.trim()] = value;
  }

  // Convert known numeric/boolean keys
  if (settings['Width'] !== undefined)     settings['Width']     = parseFloat(settings['Width'] as string);
  if (settings['Height'] !== undefined)    settings['Height']    = parseFloat(settings['Height'] as string);
  if (settings['Resizable'] !== undefined) settings['Resizable'] = (settings['Resizable'] as string).toLowerCase() === 'true';
  if (settings['Fullscreen'] !== undefined)settings['Fullscreen']= (settings['Fullscreen'] as string).toLowerCase() === 'true';
  if (settings['VSync'] !== undefined)     settings['VSync']     = (settings['VSync'] as string).toLowerCase() === 'true';
  if (settings['UseVulkan'] !== undefined) settings['UseVulkan'] = (settings['UseVulkan'] as string).toLowerCase() === 'true';

  return settings;
}

// ---------- Array‑of‑objects CSV (like Scheduler.csv, Panel.csv, etc.) ----------
export function parseCsvArray(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Find the real header (skip empty lines / comment lines that start with #)
  let headerIdx = 0;
  while (headerIdx < lines.length) {
    const line = lines[headerIdx].trim();
    if (line !== '' && !line.startsWith('#')) break;
    headerIdx++;
  }
  if (headerIdx >= lines.length) return [];

  const headers = lines[headerIdx].split(',').map(h => h.trim());
  const result: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const cols = trimmed.split(',');
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ? cols[j].trim() : '';
    }
    result.push(row);
  }
  return result;
}
