// Controls/Camera.ts
import { registerSystemMethod } from '../Core/Scheduler.js';
import { BaseWorldData } from '../Core/BaseWorldData.js';
import { getWorld } from '../Core/GlobalWorld.js';
import { Input, IsActionHeld, IsActionPressed, ConsumeAction } from './Input.js';
import { panelEntities } from '../Ui/Panel.js';
import { Entity, CameraComponent, PanelComponent } from '../Core/ECS.js';

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
  const rows = BaseWorldData.camera;
  if (rows.length < 1) return;
  const row = rows[0];

  const pos   = { x: parseFloat(row['PosX']??'0'), y: parseFloat(row['PosY']??'2'), z: parseFloat(row['PosZ']??'-5') };
  const pivot = { x: parseFloat(row['PivotX']??'0'), y: parseFloat(row['PivotY']??'0'), z: parseFloat(row['PivotZ']??'0') };
  const fov   = parseFloat(row['Fov']??'60');
  const near  = parseFloat(row['Near']??'0.1');
  const far   = parseFloat(row['Far']??'1000');
  invertX     = row['InvertX']?.toLowerCase() === 'true';
  invertY     = row['InvertY']?.toLowerCase() === 'true';
  orbitSpeed  = parseFloat(row['orbit_speed']??'0.15');
  panSpeed    = parseFloat(row['pan_speed']??'0.01');
  zoomSpeed   = parseFloat(row['zoom_speed']??'0.5');
  keyRotateSpeed  = parseFloat(row['key_rotate_speed']??'0.1');
  mouseOrbitSens  = parseFloat(row['mouse_orbit_sensitivity']??'0.005');
  mousePanSens    = parseFloat(row['mouse_pan_sensitivity']??'0.01');

  viewDirections['front']  = { x: parseFloat(row['FrontX']??'0'), y: parseFloat(row['FrontY']??'0'), z: parseFloat(row['FrontZ']??'-1') };
  viewDirections['back']   = { x: parseFloat(row['BackX']??'0'), y: parseFloat(row['BackY']??'0'), z: parseFloat(row['BackZ']??'1') };
  viewDirections['left']   = { x: parseFloat(row['LeftX']??'-1'), y: parseFloat(row['LeftY']??'0'), z: parseFloat(row['LeftZ']??'0') };
  viewDirections['right']  = { x: parseFloat(row['RightX']??'1'), y: parseFloat(row['RightY']??'0'), z: parseFloat(row['RightZ']??'0') };
  viewDirections['top']    = { x: parseFloat(row['TopX']??'0'), y: parseFloat(row['TopY']??'1'), z: parseFloat(row['TopZ']??'0') };
  viewDirections['bottom'] = { x: parseFloat(row['BottomX']??'0'), y: parseFloat(row['BottomY']??'-1'), z: parseFloat(row['BottomZ']??'0') };

  const world = getWorld();
  const old: Entity[] = [];
  world.forEach<CameraComponent>('CameraComponent', e => old.push(e));
  for (const e of old) world.destroyEntity(e);
  const cam = world.createEntity();
  world.addComponent<CameraComponent>(cam, {
    type: 'CameraComponent',
    position: pos,
    pivot,
    fov, near, far,
    invertX, invertY
  });
  world.executeCommands();
  console.log('[Camera] Loaded and camera entity created');
}

function isMouseOverUI(): boolean {
  const mouse = Input.MousePos;
  for (const [name, entity] of panelEntities) {
    const panel = getWorld().getComponent<PanelComponent>(entity, 'PanelComponent');
    if (!panel || !panel.visible) continue;
    const trans = getWorld().getComponent<TransformComponent>(entity as any, 'TransformComponent');
    if (!trans) continue;
    const x = trans.position.x - trans.scale.x*0.5;
    const y = trans.position.y - trans.scale.y*0.5;
    if (mouse.x >= x && mouse.x <= x + trans.scale.x && mouse.y >= y && mouse.y <= y + trans.scale.y) return true;
  }
  return false;
}

function Update() {
  const world = getWorld();
  let camEntity: Entity | null = null;
  world.forEach<CameraComponent>('CameraComponent', (e) => { camEntity = e; });
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
  if (IsActionPressed('view_front')) { ConsumeAction('view_front'); dir = { ...viewDirections['front'] }; }
  else if (IsActionPressed('view_back')) { ConsumeAction('view_back'); dir = { ...viewDirections['back'] }; }
  else if (IsActionPressed('view_right')) { ConsumeAction('view_right'); dir = { ...viewDirections['right'] }; }
  else if (IsActionPressed('view_left')) { ConsumeAction('view_left'); dir = { ...viewDirections['left'] }; }
  else if (IsActionPressed('view_top')) { ConsumeAction('view_top'); dir = { ...viewDirections['top'] }; }
  else if (IsActionPressed('view_bottom')) { ConsumeAction('view_bottom'); dir = { ...viewDirections['bottom'] }; }
  if (IsActionPressed('view_front')||IsActionPressed('view_back')||IsActionPressed('view_right')||
      IsActionPressed('view_left')||IsActionPressed('view_top')||IsActionPressed('view_bottom')) {
    pos = { x: pivot.x + dir.x * dist, y: pivot.y + dir.y * dist, z: pivot.z + dir.z * dist };
  }

  if (IsActionPressed('toggle_ortho')) { ConsumeAction('toggle_ortho'); orthographic = !orthographic; }
  if (IsActionPressed('set_pivot')) {
    ConsumeAction('set_pivot');
    const newPivot = { x: (pivot.x+pos.x)*0.5, y: (pivot.y+pos.y)*0.5, z: (pivot.z+pos.z)*0.5 };
    const newDist = Math.sqrt((pos.x-newPivot.x)**2+(pos.y-newPivot.y)**2+(pos.z-newPivot.z)**2);
    if (newDist > 0.1) { pivot = newPivot; dist = newDist; }
  }

  // Keyboard rotation
  if (IsActionHeld('rotate_left')) { dir = rotateY(dir, -keyRotateSpeed); }
  if (IsActionHeld('rotate_right')) { dir = rotateY(dir, keyRotateSpeed); }
  if (IsActionHeld('rotate_up')) {
    let right = cross({x:0,y:1,z:0}, dir);
    if (lengthSq(right) < 0.001) right = {x:1,y:0,z:0};
    dir = rotateAroundAxis(dir, normalize(right), keyRotateSpeed);
  }
  if (IsActionHeld('rotate_down')) {
    let right = cross({x:0,y:1,z:0}, dir);
    if (lengthSq(right) < 0.001) right = {x:1,y:0,z:0};
    dir = rotateAroundAxis(dir, normalize(right), -keyRotateSpeed);
  }
  pos = { x: pivot.x + dir.x*dist, y: pivot.y + dir.y*dist, z: pivot.z + dir.z*dist };

  // Mouse controls – blocked over UI
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
      let right = cross({x:0,y:1,z:0}, dir);
      if (lengthSq(right) < 0.001) right = {x:1,y:0,z:0};
      const newDir = rotateAroundAxis(dir, normalize(right), ay);
      if (Math.abs(dot(newDir, {x:0,y:1,z:0})) < 0.99) dir = newDir;
    }
    if (IsActionHeld('camera_pan')) {
      let panDx = dx * mousePanSens, panDy = dy * mousePanSens;
      if (invertX) panDx = -panDx;
      if (invertY) panDy = -panDy;
      const forward = normalize({x: pivot.x-pos.x, y: pivot.y-pos.y, z: pivot.z-pos.z});
      let right = cross(forward, {x:0,y:1,z:0});
      if (lengthSq(right) < 0.001) right = {x:1,y:0,z:0};
      right = normalize(right);
      const up = cross(right, forward);
      const pan = { x: -right.x*panDx - up.x*panDy, y: -right.y*panDx - up.y*panDy, z: -right.z*panDx - up.z*panDy };
      pos = { x: pos.x+pan.x, y: pos.y+pan.y, z: pos.z+pan.z };
      pivot = { x: pivot.x+pan.x, y: pivot.y+pan.y, z: pivot.z+pan.z };
    }
    const scroll = Input.ScrollDelta;
    if (Math.abs(scroll) > 0.001) {
      dist -= scroll * zoomSpeed;
      dist = Math.max(0.5, Math.min(100, dist));
    }
    pos = { x: pivot.x + dir.x*dist, y: pivot.y + dir.y*dist, z: pivot.z + dir.z*dist };
  }

  cam.position = pos;
  cam.pivot = pivot;
  world.setComponent(camEntity, cam);
}

//--- vector helpers ---
function rotateY(v: ViewDir, a: number): ViewDir {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x*c + v.z*s, y: v.y, z: -v.x*s + v.z*c };
}
function rotateAroundAxis(v: ViewDir, axis: ViewDir, a: number): ViewDir {
  const c = Math.cos(a), s = Math.sin(a);
  const d = v.x*axis.x+v.y*axis.y+v.z*axis.z;
  const cr = { x: axis.y*v.z - axis.z*v.y, y: axis.z*v.x - axis.x*v.z, z: axis.x*v.y - axis.y*v.x };
  return { x: v.x*c + cr.x*s + axis.x*d*(1-c), y: v.y*c + cr.y*s + axis.y*d*(1-c), z: v.z*c + cr.z*s + axis.z*d*(1-c) };
}
function cross(a: ViewDir, b: ViewDir) { return { x: a.y*b.z-a.z*b.y, y: a.z*b.x-a.x*b.z, z: a.x*b.y-a.y*b.x }; }
function dot(a: ViewDir, b: ViewDir) { return a.x*b.x+a.y*b.y+a.z*b.z; }
function lengthSq(v: ViewDir) { return v.x*v.x+v.y*v.y+v.z*v.z; }
function normalize(v: ViewDir): ViewDir {
  const l = Math.sqrt(lengthSq(v));
  return l < 0.0001 ? {x:0,y:0,z:0} : { x: v.x/l, y: v.y/l, z: v.z/l };
}

registerSystemMethod('SETUE.Controls.Camera', 'Load', Load);
registerSystemMethod('SETUE.Controls.Camera', 'Update', Update);
