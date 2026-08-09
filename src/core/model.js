import * as THREE from 'three';
import { materialById } from '../lib/materials.js';

// ---------------------------------------------------------------------------
// Document model.
//
// Entities:
//   Profile — a closed 2D shape on a plane (not yet extruded). kind: 'poly'|'circle'
//   Solid   — a Profile plus an extrusion depth along the plane normal,
//             with an optional world transform (from Move/Rotate).
//   Dimension — a linear dimension annotation between two 3D points.
//
// Planes are stored as { origin:[x,y,z], u:[..], v:[..] }; normal = u × v.
// All lengths are inches. World is Y-up; the ground plane is XZ.
// ---------------------------------------------------------------------------

let nextId = 1;
export const newId = () => `e${nextId++}`;

export const GROUND_PLANE = () => ({
  origin: [0, 0, 0],
  u: [1, 0, 0],
  v: [0, 0, -1], // u × v = +Y
});

export function planeNormal(plane) {
  const u = new THREE.Vector3(...plane.u);
  const v = new THREE.Vector3(...plane.v);
  return u.cross(v).normalize();
}

export function planeToWorld(plane, x, y) {
  return new THREE.Vector3(...plane.origin)
    .addScaledVector(new THREE.Vector3(...plane.u), x)
    .addScaledVector(new THREE.Vector3(...plane.v), y);
}

export function worldToPlane(plane, p) {
  const rel = p.clone().sub(new THREE.Vector3(...plane.origin));
  return new THREE.Vector2(
    rel.dot(new THREE.Vector3(...plane.u)),
    rel.dot(new THREE.Vector3(...plane.v)),
  );
}

export class Model {
  constructor(scene) {
    this.scene = scene;
    this.entities = new Map(); // id -> entity data
    this.objects = new Map();  // id -> THREE.Group
    this.layers = [
      { id: 'L0', name: 'Layer 0', color: '#8fb8d8', visible: true },
    ];
    this.activeLayerId = 'L0';
    this.scenes = []; // saved camera views: {id,name,position,target}
    this.projectInfo = { project: '', customer: '', author: '', number: '' };
    this.group = new THREE.Group();
    this.group.name = 'model';
    scene.add(this.group);
    this.onChange = null; // callback for UI refresh
  }

  layer(id) { return this.layers.find(l => l.id === id) || this.layers[0]; }

  addLayer(name, color) {
    const id = `L${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    this.layers.push({ id, name, color, visible: true });
    this.changed();
    return id;
  }

  setLayerVisible(id, visible) {
    const l = this.layer(id);
    l.visible = visible;
    for (const [eid, e] of this.entities) {
      if (e.layerId === id) {
        const obj = this.objects.get(eid);
        if (obj) obj.visible = visible;
      }
    }
    this.changed();
  }

  changed() {
    if (this._batching) { this._dirty = true; return; }
    this.onChange?.();
  }

  /** Batch many mutations into a single onChange (undo/load/bulk tools). */
  batch(fn) {
    if (this._batching) return fn(); // already inside a batch
    this._batching = true;
    this._dirty = false;
    try { fn(); } finally {
      this._batching = false;
      if (this._dirty) { this._dirty = false; this.onChange?.(); }
    }
  }

  // ---- entity CRUD --------------------------------------------------------

  addProfile(profile) {
    const e = { id: newId(), type: 'profile', layerId: this.activeLayerId, ...profile };
    this.entities.set(e.id, e);
    this.rebuildObject(e);
    this.changed();
    return e;
  }

  addSolid(solid) {
    const e = {
      id: newId(), type: 'solid', layerId: this.activeLayerId,
      transform: null, // { position:[..], rotationY }
      ...solid,
    };
    this.entities.set(e.id, e);
    this.rebuildObject(e);
    this.changed();
    return e;
  }

  addDimension(dim) {
    const e = { id: newId(), type: 'dimension', layerId: this.activeLayerId, ...dim };
    this.entities.set(e.id, e);
    this.rebuildObject(e);
    this.changed();
    return e;
  }

  addLabel(lbl) {
    const e = { id: newId(), type: 'label', layerId: this.activeLayerId, ...lbl };
    this.entities.set(e.id, e);
    this.rebuildObject(e);
    this.changed();
    return e;
  }

  /** Open polyline: { points: [[x,y,z], ...] } in world coords. */
  addEdge(edge) {
    const e = { id: newId(), type: 'edge', layerId: this.activeLayerId, ...edge };
    this.entities.set(e.id, e);
    this.rebuildObject(e);
    this.changed();
    return e;
  }

  remove(id) {
    const obj = this.objects.get(id);
    if (obj) { this.group.remove(obj); disposeObject(obj); this.objects.delete(id); }
    this.entities.delete(id);
    this.changed();
  }

  update(e) {
    this.entities.set(e.id, e);
    this.rebuildObject(e);
    this.changed();
  }

  /** Deep-copy an entity under a new id and add it to the model. */
  cloneEntity(id) {
    const src = this.entities.get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = newId();
    this.entities.set(copy.id, copy);
    this.rebuildObject(copy);
    this.changed();
    return copy;
  }

  clear() {
    this.batch(() => {
      for (const id of [...this.entities.keys()]) this.remove(id);
      this.layers = [{ id: 'L0', name: 'Layer 0', color: '#8fb8d8', visible: true }];
      this.activeLayerId = 'L0';
      this.changed();
    });
  }

  // ---- mesh construction --------------------------------------------------

  rebuildObject(e) {
    const old = this.objects.get(e.id);
    if (old) { this.group.remove(old); disposeObject(old); }
    let obj;
    if (e.type === 'profile') obj = buildProfileObject(e, this.layer(e.layerId));
    else if (e.type === 'solid') obj = buildSolidObject(e, this.layer(e.layerId));
    else if (e.type === 'dimension') obj = buildDimensionObject(e, this.layer(e.layerId));
    else if (e.type === 'label') obj = buildLabelObject(e);
    else if (e.type === 'edge') obj = buildEdgeObject(e, this.layer(e.layerId));
    if (!obj) return;
    obj.userData.entityId = e.id;
    obj.traverse(c => (c.userData.entityId = e.id));
    obj.visible = this.layer(e.layerId).visible;
    this.group.add(obj);
    this.objects.set(e.id, obj);
  }

  rebuildAll() {
    for (const e of this.entities.values()) this.rebuildObject(e);
  }

  /** All meshes that can be raycast (solids + profiles). Pass true to include dimension lines. */
  pickables(includeDimensions = false) {
    const list = [];
    for (const [id, obj] of this.objects) {
      const e = this.entities.get(id);
      if (!e || !obj.visible) continue;
      if (e.type === 'solid' || e.type === 'profile') {
        obj.traverse(c => { if (c.isMesh) list.push(c); });
      } else if (includeDimensions
        && (e.type === 'dimension' || e.type === 'label' || e.type === 'edge')) {
        obj.traverse(c => { if (c.isLine || c.isSprite) list.push(c); });
      }
    }
    return list;
  }

  /** World-space snap vertices for the inference engine. */
  snapPoints() {
    const pts = [];
    for (const e of this.entities.values()) {
      if (!this.layer(e.layerId).visible) continue;
      if (e.type === 'profile' || e.type === 'solid') {
        const corners = profileCorners(e);
        const n = planeNormal(e.plane);
        const matrix = solidMatrix(e);
        for (const c of corners) {
          const base = planeToWorld(e.plane, c.x, c.y);
          pts.push(base.clone().applyMatrix4(matrix));
          if (e.type === 'solid') {
            pts.push(base.clone().addScaledVector(n, e.depth).applyMatrix4(matrix));
          }
        }
        // edge midpoints on the base loop
        for (let i = 0; i < corners.length; i++) {
          const a = corners[i], b = corners[(i + 1) % corners.length];
          const mid = planeToWorld(e.plane, (a.x + b.x) / 2, (a.y + b.y) / 2);
          pts.push(mid.applyMatrix4(matrix));
        }
      } else if (e.type === 'dimension') {
        pts.push(new THREE.Vector3(...e.p1), new THREE.Vector3(...e.p2));
      } else if (e.type === 'label') {
        pts.push(new THREE.Vector3(...e.position));
      } else if (e.type === 'edge') {
        // every vertex plus segment midpoints — lines connect to lines
        for (let i = 0; i < e.points.length; i++) {
          pts.push(new THREE.Vector3(...e.points[i]));
          if (i > 0) {
            const a = e.points[i - 1], b = e.points[i];
            pts.push(new THREE.Vector3(
              (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2));
          }
        }
      }
    }
    return pts;
  }

  // ---- serialization ------------------------------------------------------

  serialize() {
    return {
      app: 'cadshop', version: 1,
      layers: this.layers,
      activeLayerId: this.activeLayerId,
      projectInfo: this.projectInfo,
      scenes: this.scenes,
      entities: [...this.entities.values()],
    };
  }

  load(data) {
    this.batch(() => {
      this.clear();
      if (Array.isArray(data.layers) && data.layers.length) this.layers = data.layers;
      this.activeLayerId = data.activeLayerId || this.layers[0].id;
      this.projectInfo = { ...this.projectInfo, ...(data.projectInfo || {}) };
      this.scenes = Array.isArray(data.scenes) ? data.scenes : [];
      let maxNum = 0;
      for (const e of data.entities || []) {
        this.entities.set(e.id, e);
        this.rebuildObject(e);
        const m = /^e(\d+)$/.exec(e.id);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1]));
      }
      nextId = maxNum + 1;
      this.changed();
    });
  }
}

// ---------------------------------------------------------------------------

export function profileCorners(e) {
  if (e.kind === 'circle') {
    const pts = [];
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector2(
        e.center[0] + Math.cos(a) * e.radius,
        e.center[1] + Math.sin(a) * e.radius,
      ));
    }
    return pts;
  }
  return e.points.map(p => new THREE.Vector2(p[0], p[1]));
}

export function solidMatrix(e) {
  const m = new THREE.Matrix4();
  if (e.transform) {
    const t = e.transform;
    m.makeRotationY(t.rotationY || 0);
    m.setPosition(new THREE.Vector3(...(t.position || [0, 0, 0])));
  }
  return m;
}

function makeShape(e) {
  const shape = new THREE.Shape();
  if (e.kind === 'circle') {
    shape.absarc(e.center[0], e.center[1], e.radius, 0, Math.PI * 2, false);
    if (e.innerRadius > 0) {
      const hole = new THREE.Path();
      hole.absarc(e.center[0], e.center[1], e.innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
  } else {
    const pts = e.points;
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    for (const holePts of e.holes || []) {
      const hole = new THREE.Path();
      hole.moveTo(holePts[0][0], holePts[0][1]);
      for (let i = 1; i < holePts.length; i++) hole.lineTo(holePts[i][0], holePts[i][1]);
      hole.closePath();
      shape.holes.push(hole);
    }
  }
  return shape;
}

/** Cross-section area of a profile/solid entity, holes subtracted (sq in). */
export function computeArea(e) {
  if (e.kind === 'circle') {
    const inner = e.innerRadius > 0 ? e.innerRadius : 0;
    return Math.PI * (e.radius * e.radius - inner * inner);
  }
  const shoelace = (pts) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
  };
  let area = shoelace(e.points);
  for (const hole of e.holes || []) area -= shoelace(hole);
  return Math.max(area, 0);
}

/** Matrix mapping shape-local (x=u, y=v, z=normal) into world. */
function planeMatrix(plane) {
  const u = new THREE.Vector3(...plane.u);
  const v = new THREE.Vector3(...plane.v);
  const n = u.clone().cross(v).normalize();
  const m = new THREE.Matrix4();
  m.makeBasis(u, v, n);
  m.setPosition(new THREE.Vector3(...plane.origin));
  return m;
}

function buildProfileObject(e, layer) {
  const group = new THREE.Group();
  const shape = makeShape(e);
  const geo = new THREE.ShapeGeometry(shape, 32);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(layer.color).multiplyScalar(0.85),
    side: THREE.DoubleSide, roughness: 0.9, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    transparent: true, opacity: 0.85,
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geo, 15);
  group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x0d0f12 })));

  group.applyMatrix4(planeMatrix(e.plane));
  return group;
}

function buildSolidObject(e, layer) {
  const group = new THREE.Group();
  const shape = makeShape(e);
  const depth = Math.abs(e.depth) || 0.01;
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 });
  if (e.depth < 0) geo.translate(0, 0, e.depth); // extrude downward from the plane
  const matDef = materialById(e.material);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(matDef.color || layer.color),
    roughness: matDef.roughness, metalness: matDef.metalness,
    side: THREE.DoubleSide, // tolerate either profile winding
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);

  const edges = new THREE.EdgesGeometry(geo, 15);
  group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x14171c })));

  const local = planeMatrix(e.plane);
  const world = solidMatrix(e).multiply(local);
  group.applyMatrix4(world);
  return group;
}

const DIM_COLOR = 0xd7a94a;

function buildDimensionObject(e) {
  const group = new THREE.Group();
  const p1 = new THREE.Vector3(...e.p1);
  const p2 = new THREE.Vector3(...e.p2);
  const dir = p2.clone().sub(p1);
  const len = dir.length();
  if (len < 1e-6) return group;
  dir.normalize();

  // offset direction: perpendicular, horizontal preferred
  let off = new THREE.Vector3(0, 1, 0).cross(dir);
  if (off.lengthSq() < 1e-6) off = new THREE.Vector3(1, 0, 0);
  off.normalize().multiplyScalar(e.offset ?? 6);

  const a = p1.clone().add(off);
  const b = p2.clone().add(off);
  const mat = new THREE.LineBasicMaterial({ color: DIM_COLOR });
  const seg = (from, to) => new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]), mat);
  group.add(seg(p1, a), seg(p2, b), seg(a, b));

  // tick marks
  const tick = dir.clone().add(off.clone().normalize()).normalize().multiplyScalar(2);
  group.add(seg(a.clone().sub(tick), a.clone().add(tick)));
  group.add(seg(b.clone().sub(tick), b.clone().add(tick)));

  // label sprite, sized relative to the dimension so it reads at any scale
  const spriteScale = Math.max(0.08, Math.min(0.35, len * 0.004));
  const label = makeTextSprite(e.label || '', DIM_COLOR, spriteScale);
  label.position.copy(a.clone().add(b).multiplyScalar(0.5)).add(off.clone().normalize().multiplyScalar(3));
  group.add(label);
  return group;
}

function buildEdgeObject(e, layer) {
  const group = new THREE.Group();
  const pts = e.points.map(p => new THREE.Vector3(...p));
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: new THREE.Color(layer.color).multiplyScalar(1.15) }));
  group.add(line);
  // endpoint dots so open ends are easy to see and pick up
  const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(layer.color) });
  for (const p of [pts[0], pts[pts.length - 1]]) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), dotMat);
    dot.position.copy(p);
    group.add(dot);
  }
  return group;
}

function buildLabelObject(e) {
  const group = new THREE.Group();
  const p = new THREE.Vector3(...e.position);
  const anchor = p.clone().add(new THREE.Vector3(0, 10, 0));
  const sprite = makeTextSprite(e.text || 'Note', 0xe8eaed, 0.22);
  sprite.position.copy(anchor);
  group.add(sprite);
  const mat = new THREE.LineBasicMaterial({ color: 0x9aa2ad });
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, anchor]), mat));
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x9aa2ad }));
  dot.position.copy(p);
  group.add(dot);
  return group;
}

export function makeTextSprite(text, color = 0xffffff, scale = 0.35) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = '28px "Segoe UI", sans-serif';
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 20;
  const h = 40;
  canvas.width = w; canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = 'rgba(20,22,26,0.85)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 10, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(w * scale, h * scale, 1); // scale = world inches per canvas px
  sprite.renderOrder = 10;
  return sprite;
}

function disposeObject(obj) {
  obj.traverse(c => {
    c.geometry?.dispose?.();
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach(m => { m.map?.dispose?.(); m.dispose?.(); });
    }
  });
}
