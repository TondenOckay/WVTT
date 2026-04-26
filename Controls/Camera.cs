// Controls/Camera.ts
import { parseCsvArray } from '../parseCsv.js';
import { registerSystemMethod } from '../Core/Scheduler.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input, IsActionHeld, IsActionPressed, ConsumeAction } from './Input.js';
import { panelRegions } from '../Ui/Panel.js';   // for IsMouseOverUI
import { TransformComponent, PanelComponent, CameraComponent } from '../Core/ECS.js';

let orbitSpeed      = 0.15;
let panSpeed        = 0.01;
let zoomSpeed       = 0.5;
let invertX         = true;
let invertY         = true;
let keyRotateSpeed  = 0.1;
let mouseOrbitSens  = 0.005;
let mousePanSens    = 0.01;
let orthographic    = false;

interface ViewDir { x: number; y: number; z: number; }
const viewDirections: Record<string, ViewDir> = {};

function Load() {
  return fetch('Controls/Camera.csv')
    .then(r => r.text())
    .then(text => {
      const rows = parseCsvArray(text);
      if (rows.length < 1) return;
      const row = rows[0];   // use first data row

      // Read all fields with fallbacks
      const pos = {
        x: parseFloat(row['PosX'] ?? '0'),
        y: parseFloat(row['PosY'] ?? '2'),
        z: parseFloat(row['PosZ'] ?? '-5')
      };
      const pivot = {
        x: parseFloat(row['PivotX'] ?? '0'),
        y: parseFloat(row['PivotY'] ?? '0'),
        z: parseFloat(row['PivotZ'] ?? '0')
      };
      const fov  = parseFloat(row['Fov'] ?? '60');
      const near = parseFloat(row['Near'] ?? '0.1');
      const far  = parseFloat(row['Far'] ?? '1000');
      invertX    = row['InvertX']?.toLowerCase() === 'true';
      invertY    = row['InvertY']?.toLowerCase() === 'true';
      orbitSpeed = parseFloat(row['orbit_speed'] ?? '0.15');
      panSpeed   = parseFloat(row['pan_speed'] ?? '0.01');
      zoomSpeed  = parseFloat(row['zoom_speed'] ?? '0.5');
      keyRotateSpeed = parseFloat(row['key_rotate_speed'] ?? '0.1');
      mouseOrbitSens = parseFloat(row['mouse_orbit_sensitivity'] ?? '0.005');
      mousePanSens   = parseFloat(row['mouse_pan_sensitivity'] ?? '0.01');

      // View directions
      viewDirections['front']  = { x: parseFloat(row['FrontX']??'0'), y: parseFloat(row['FrontY']??'0'), z: parseFloat(row['FrontZ']??'-1') };
      viewDirections['back']   = { x: parseFloat(row['BackX']??'0'), y: parseFloat(row['BackY']??'0'), z: parseFloat(row['BackZ']??'1') };
      viewDirections['left']   = { x: parseFloat(row['LeftX']??'-1'), y: parseFloat(row['LeftY']??'0'), z: parseFloat(row['LeftZ']??'0') };
      viewDirections['right']  = { x: parseFloat(row['RightX']??'1'), y: parseFloat(row['RightY']??'0'), z: parseFloat(row['RightZ']??'0') };
      viewDirections['top']    = { x: parseFloat(row['TopX']??'0'), y: parseFloat(row['TopY']??'1'), z: parseFloat(row['TopZ']??'0') };
      viewDirections['bottom'] = { x: parseFloat(row['BottomX']??'0'), y: parseFloat(row['BottomY']??'-1'), z: parseFloat(row['BottomZ']??'0') };

      const world = getWorld();

      // Destroy existing camera entities
      world.forEach1<CameraComponent>('CameraComponent', (e) => {
        world.destroyEntity(e);
      });
      world.executeCommands();

      // Create new camera entity
      const camEntity = world.createEntity();
      world.addComponent<CameraComponent>(camEntity, {
        type: 'CameraComponent',
        position: pos,
        pivot: pivot,
        fov, near, far,
        invertX, invertY
      });
      world.executeCommands();
      console.log('[Camera] Loaded and camera entity created');
    });
}

/** Returns true if the mouse is inside any visible UI panel */
function isMouseOverUI(): boolean {
  const world = getWorld();
  const mouse = Input.MousePos;

  // Collect visible panels, sort by layer descending
  const candidates: { left: number; right: number; top: number; bottom: number; layer: number }[] = [];
  for (const [name, region] of panelRegions) {
    // get panel visibility (we can check ECS, but for simplicity check if panel region exists)
    // We need visibility from ECS; we'll query PanelComponent per name? might be heavy, but acceptable.
    const entity = panelEntities.get(name);
    if (!entity) continue;
    const panel = world.getComponent<PanelComponent>(entity, 'PanelComponent');
    if (!panel || !panel.visible) continue;
    candidates.push({
      left: region.x, right: region.x + region.width,
      top: region.y, bottom: region.y + region.height,
      layer: panel.layer
    });
  }
  candidates.sort((a, b) => b.layer - a.layer);

  for (const c of candidates) {
    if (mouse.x >= c.left && mouse.x <= c.right && mouse.y >= c.top && mouse.y <= c.bottom) {
      return true;
    }
  }
  return false;
}

function Update() {
  const world = getWorld();
  let camEntity = null;
  world.forEach1<CameraComponent>('CameraComponent', (e) => { camEntity = e; });
  if (!camEntity) return;

  const cam = world.getComponent<CameraComponent>(camEntity, 'CameraComponent')!;
  let pos = { ...cam.position };
  let pivot = { ...cam.pivot };

  let dist = Math.sqrt((pos.x-pivot.x)**2 + (pos.y-pivot.y)**2 + (pos.z-pivot.z)**2);
  if (dist < 0.001) dist = 0.001;
  let dir = {
    x: (pos.x - pivot.x) / dist,
    y: (pos.y - pivot.y) / dist,
    z: (pos.z - pivot.z) / dist
  };

  // Keyboard view presets
  if (IsActionPressed('view_front')) {
    ConsumeAction('view_front');
    dir = { ...viewDirections['front'] };
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  } else if (IsActionPressed('view_back')) {
    ConsumeAction('view_back');
    dir = { ...viewDirections['back'] };
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  } else if (IsActionPressed('view_right')) {
    ConsumeAction('view_right');
    dir = { ...viewDirections['right'] };
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  } else if (IsActionPressed('view_left')) {
    ConsumeAction('view_left');
    dir = { ...viewDirections['left'] };
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  } else if (IsActionPressed('view_top')) {
    ConsumeAction('view_top');
    dir = { ...viewDirections['top'] };
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  } else if (IsActionPressed('view_bottom')) {
    ConsumeAction('view_bottom');
    dir = { ...viewDirections['bottom'] };
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  }

  if (IsActionPressed('toggle_ortho')) {
    ConsumeAction('toggle_ortho');
    orthographic = !orthographic;
    console.log(`[Camera] Orthographic: ${orthographic}`);
  }

  if (IsActionPressed('set_pivot')) {
    ConsumeAction('set_pivot');
    // Lerp pivot to midpoint
    const newPivot = {
      x: (pivot.x + pos.x) * 0.5,
      y: (pivot.y + pos.y) * 0.5,
      z: (pivot.z + pos.z) * 0.5
    };
    const newDist = Math.sqrt((pos.x-newPivot.x)**2 + (pos.y-newPivot.y)**2 + (pos.z-newPivot.z)**2);
    if (newDist > 0.1) {
      pivot = newPivot;
      dist = newDist;
      console.log(`[Camera] Pivot moved to ${pivot.x.toFixed(2)},${pivot.y.toFixed(2)},${pivot.z.toFixed(2)}`);
    }
  }

  // Keyboard rotation
  if (IsActionHeld('rotate_left')) {
    const angle = -keyRotateSpeed;
    // rotate around world Y
    dir = rotateY(dir, angle);
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  }
  if (IsActionHeld('rotate_right')) {
    const angle = keyRotateSpeed;
    dir = rotateY(dir, angle);
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  }
  if (IsActionHeld('rotate_up')) {
    let right = cross({ x:0, y:1, z:0 }, dir);
    if (lengthSq(right) < 0.001) right = { x:1, y:0, z:0 };
    right = normalize(right);
    dir = rotateAroundAxis(dir, right, keyRotateSpeed);
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  }
  if (IsActionHeld('rotate_down')) {
    let right = cross({ x:0, y:1, z:0 }, dir);
    if (lengthSq(right) < 0.001) right = { x:1, y:0, z:0 };
    right = normalize(right);
    dir = rotateAroundAxis(dir, right, -keyRotateSpeed);
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  }

  // Mouse controls – only if not over UI
  if (!isMouseOverUI()) {
    const delta = Input.MouseDelta;
    const dx = Math.max(-50, Math.min(50, delta.x));
    const dy = Math.max(-50, Math.min(50, delta.y));

    if (IsActionHeld('camera_orbit')) {
      let ax = dx * mouseOrbitSens;
      let ay = dy * mouseOrbitSens;
      if (invertX) ax = -ax;
      if (invertY) ay = -ay;

      dir = rotateY(dir, ax);

      let right = cross({ x:0, y:1, z:0 }, dir);
      if (lengthSq(right) < 0.001) right = { x:1, y:0, z:0 };
      right = normalize(right);
      const newDir = rotateAroundAxis(dir, right, ay);
      // Prevent flipping
      if (Math.abs(dot(newDir, { x:0, y:1, z:0 })) < 0.99) {
        dir = newDir;
      }
      pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
    }

    if (IsActionHeld('camera_pan')) {
      let panDx = dx * mousePanSens;
      let panDy = dy * mousePanSens;
      if (invertX) panDx = -panDx;
      if (invertY) panDy = -panDy;

      const forward = normalize({ x: pivot.x - pos.x, y: pivot.y - pos.y, z: pivot.z - pos.z });
      let right = cross(forward, { x:0, y:1, z:0 });
      if (lengthSq(right) < 0.001) right = { x:1, y:0, z:0 };
      right = normalize(right);
      const up = cross(right, forward);

      const panVec = {
        x: -right.x * panDx - up.x * panDy,
        y: -right.y * panDx - up.y * panDy,
        z: -right.z * panDx - up.z * panDy
      };
      pos = { x: pos.x + panVec.x, y: pos.y + panVec.y, z: pos.z + panVec.z };
      pivot = { x: pivot.x + panVec.x, y: pivot.y + panVec.y, z: pivot.z + panVec.z };
    }

    const scroll = Input.ScrollDelta;
    if (Math.abs(scroll) > 0.001) {
      dist -= scroll * zoomSpeed;
      dist = Math.max(0.5, Math.min(100, dist));
      pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
    }
  }

  // Apply changes back to ECS
  cam.position = pos;
  cam.pivot = pivot;
  world.setComponent(camEntity, cam);
}

// --- helper vector math functions ---
function rotateY(v: ViewDir, angle: number): ViewDir {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return {
    x: v.x * cos + v.z * sin,
    y: v.y,
    z: -v.x * sin + v.z * cos
  };
}
function rotateAroundAxis(v: ViewDir, axis: ViewDir, angle: number): ViewDir {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // Rodrigues' rotation formula
  const dotV = v.x*axis.x + v.y*axis.y + v.z*axis.z;
  const cross = {
    x: axis.y * v.z - axis.z * v.y,
    y: axis.z * v.x - axis.x * v.z,
    z: axis.x * v.y - axis.y * v.x
  };
  return {
    x: v.x * cos + cross.x * sin + axis.x * dotV * (1 - cos),
    y: v.y * cos + cross.y * sin + axis.y * dotV * (1 - cos),
    z: v.z * cos + cross.z * sin + axis.z * dotV * (1 - cos)
  };
}
function cross(a: ViewDir, b: ViewDir): ViewDir {
  return {
    x: a.y*b.z - a.z*b.y,
    y: a.z*b.x - a.x*b.z,
    z: a.x*b.y - a.y*b.x
  };
}
function dot(a: ViewDir, b: ViewDir): number {
  return a.x*b.x + a.y*b.y + a.z*b.z;
}
function lengthSq(v: ViewDir): number { return v.x*v.x + v.y*v.y + v.z*v.z; }
function normalize(v: ViewDir): ViewDir {
  const len = Math.sqrt(lengthSq(v));
  if (len < 0.0001) return { x:0, y:0, z:0 };
  return { x: v.x/len, y: v.y/len, z: v.z/len };
}

registerSystemMethod('SETUE.Controls.Camera', 'Load', Load);
registerSystemMethod('SETUE.Controls.Camera', 'Update', Update);
