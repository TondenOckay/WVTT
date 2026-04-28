// Systems/SystemEditor.ts
import { registerSystemMethod } from '../Core/Scheduler.js';

// ---------- HTML elements ----------
let editorDiv: HTMLDivElement | null = null;
let fileTree: HTMLDivElement | null = null;
let gridTable: HTMLTableElement | null = null;
let statusSpan: HTMLElement | null = null;

// ---------- State ----------
let currentFilePath: string = '';
let currentCsvHeaders: string[] = [];
let currentCsvData: string[][] = [];

let allFiles = new Map<string, File>();

function createEditorUI() {
  if (editorDiv) return;

  editorDiv = document.createElement('div');
  editorDiv.id = 'systemEditorOverlay';
  editorDiv.style.cssText =
    'position:absolute;top:0;left:0;width:100%;height:100%;background:#1e1e1e;color:#d4d4d4;display:none;z-index:10000;overflow:hidden;';
  document.body.appendChild(editorDiv);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.style.cssText = 'padding:10px;background:#2d2d30;display:flex;align-items:center;gap:10px';

  const btnSelectFolder = document.createElement('button');
  btnSelectFolder.textContent = 'Select Folder';
  toolbar.appendChild(btnSelectFolder);

  const btnSave = document.createElement('button');
  btnSave.textContent = 'Save Current CSV';
  toolbar.appendChild(btnSave);

  statusSpan = document.createElement('span');
  statusSpan.style.marginLeft = 'auto';
  toolbar.appendChild(statusSpan);

  editorDiv.appendChild(toolbar);

  // Main split area
  const mainArea = document.createElement('div');
  mainArea.style.cssText = 'display:flex;flex:1;height:calc(100% - 50px)';

  // Left panel – file tree
  fileTree = document.createElement('div');
  fileTree.style.cssText = 'width:250px;overflow:auto;background:#252526;padding:5px;border-right:1px solid #3e3e42';
  mainArea.appendChild(fileTree);

  // Right panel – grid
  const rightPanel = document.createElement('div');
  rightPanel.style.cssText = 'flex:1;overflow:auto;padding:5px';
  gridTable = document.createElement('table');
  gridTable.style.cssText = 'border-collapse:collapse;width:100%';
  rightPanel.appendChild(gridTable);
  mainArea.appendChild(rightPanel);

  editorDiv.appendChild(mainArea);

  // Hidden folder input
  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.webkitdirectory = true;
  folderInput.style.display = 'none';
  document.body.appendChild(folderInput);

  // ---------- Events ----------
  btnSelectFolder.addEventListener('click', () => folderInput.click());

  folderInput.addEventListener('change', () => {
    const files = folderInput.files;
    if (!files || files.length === 0) return;

    allFiles.clear();
    for (const file of files) {
      const path = (file as any).webkitRelativePath || file.name;
      // Only keep .csv files
      if (path.toLowerCase().endsWith('.csv')) {
        allFiles.set(path, file);
      }
    }
    buildFileTree();
    statusSpan!.textContent = `Loaded ${allFiles.size} CSV files`;
  });

  btnSave.addEventListener('click', () => saveCurrentCsv());

  fileTree.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('csv-file')) {
      const path = target.getAttribute('data-path');
      if (path) loadCsvFile(path);
    }
  });
}

// ---------- Build the file tree, showing only .csv files ----------
function buildFileTree() {
  if (!fileTree) return;
  fileTree.innerHTML = '';

  // Nest files under their folder structure
  const tree: any = {};
  for (const [relPath, file] of allFiles) {
    const parts = relPath.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current[part]) {
        if (i === parts.length - 1) {
          // Leaf (file)
          current[part] = { __file: file, __path: relPath };
        } else {
          // Folder
          current[part] = {};
        }
      }
      current = current[part];
    }
  }

  renderTree(tree, fileTree, 0);
}

/** Recursively render only folders that contain .csv files and the .csv files themselves */
function renderTree(node: any, parent: HTMLElement, indent: number) {
  // Sort keys, putting folders first, then files
  const keys = Object.keys(node).sort((a, b) => {
    const aIsFile = node[a].__file !== undefined;
    const bIsFile = node[b].__file !== undefined;
    if (aIsFile && !bIsFile) return 1;
    if (!aIsFile && bIsFile) return -1;
    return a.localeCompare(b);
  });

  for (const key of keys) {
    const entry = node[key];
    const isFile = entry.__file !== undefined;

    const div = document.createElement('div');
    div.style.paddingLeft = indent * 15 + 'px';
    div.style.cursor = isFile ? 'pointer' : 'default';

    if (isFile) {
      // CSV file leaf
      div.className = 'csv-file';
      div.setAttribute('data-path', entry.__path);
      div.textContent = '📄 ' + key;
      div.style.color = '#d4d4d4';
      div.addEventListener('mouseenter', () => div.style.backgroundColor = '#094771');
      div.addEventListener('mouseleave', () => div.style.backgroundColor = '');
      parent.appendChild(div);
    } else {
      // Folder – only show if it has children (folders or csv files inside)
      if (Object.keys(entry).length > 0) {
        div.textContent = '📁 ' + key;
        div.style.fontWeight = 'bold';
        parent.appendChild(div);
        renderTree(entry, parent, indent + 1);
      }
    }
  }
}

// ---------- Load a CSV file into the grid ----------
function loadCsvFile(path: string) {
  const file = allFiles.get(path);
  if (!file) return;

  currentFilePath = path;
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result as string;
    parseCsvToGrid(text, path);
  };
  reader.readAsText(file);
}

function parseCsvToGrid(csvText: string, filename: string) {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return;
  const headers = lines[0].split(',').map(h => h.trim());
  const data: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(c => c.trim());
    data.push(row);
  }
  currentCsvHeaders = headers;
  currentCsvData = data;
  statusSpan!.textContent = `Editing: ${filename}`;
  renderGrid(headers, data);
}

function renderGrid(headers: string[], data: string[][]) {
  if (!gridTable) return;
  let html = '<thead><tr>';
  headers.forEach(h => html += `<th style="border:1px solid #555;padding:4px;background:#333">${h}</th>`);
  html += '</tr></thead><tbody>';
  data.forEach(row => {
    html += '<tr>';
    row.forEach(cell => html += `<td contenteditable="true" style="border:1px solid #555;padding:2px;background:#2d2d30">${cell}</td>`);
    html += '</tr>';
  });
  html += '</tbody>';
  gridTable.innerHTML = html;
}

// ---------- Save current CSV ----------
function saveCurrentCsv() {
  if (!gridTable) return;
  const rows = gridTable.querySelectorAll('tbody tr');
  const newData: string[][] = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    const rowData: string[] = [];
    cells.forEach(cell => rowData.push((cell as HTMLTableCellElement).innerText));
    newData.push(rowData);
  });

  let csv = currentCsvHeaders.join(',') + '\n';
  newData.forEach(row => csv += row.join(',') + '\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFilePath ? currentFilePath.replace(/\//g, '_') : 'edited.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  statusSpan!.textContent = `Saved: ${a.download}`;
}

// ---------- Public API for InterfaceManager ----------
export function toggleSystemEditor(visible: boolean) {
  if (!editorDiv) createEditorUI();
  editorDiv!.style.display = visible ? 'block' : 'none';
}

function Load() {
  createEditorUI();
}

registerSystemMethod('SETUE.Systems.SystemEditor', 'Load', Load);
