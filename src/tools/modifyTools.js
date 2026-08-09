import * as THREE from 'three';
import {
  Tool, dragDistanceAlongAxis, faceWorldNormal,
  translateEntity, rotateEntityY, cloneEntitiesRegrouped,
} from './common.js';
import { planeNormal, solidMatrix } from '../core/model.js';
import { Units } from '../core/units.js';

// ---------------------------------------------------------------------------
// Select

export class SelectTool extends Tool {
  get hint() { return 'Select: click or drag a box · Shift adds · Ctrl+G groups · Delete removes · Esc deselects'; }

  deactivate() { this.endBox(); }
  cancel() { this.endBox(); }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const app = this.app;
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables(true));
    if (hit) {
      const ids = app.groupIdsOf(hit.object.userData.entityId);
      if (ev.shiftKey) {
        // toggle the whole group in/out of the selection
        const anySelected = ids.some(id => app.isSelected(id));
        for (const id of ids) {
          if (anySelected === app.isSelected(id)) app.select(id, { additive: true });
        }
      } else {
        app.select(null);
        for (const id of ids) app.select(id, { additive: true });
      }
      return;
    }
    // empty space: start a selection box
    this.boxStart = { x: ev.clientX, y: ev.clientY, shift: ev.shiftKey };
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'select-box';
    document.getElementById('viewport-wrap').appendChild(this.boxEl);
  }

  onPointerMove(ev) {
    if (!this.boxStart || !this.boxEl) return;
    const wrap = document.getElementById('viewport-wrap').getBoundingClientRect();
    const x1 = Math.min(this.boxStart.x, ev.clientX) - wrap.left;
    const y1 = Math.min(this.boxStart.y, ev.clientY) - wrap.top;
    Object.assign(this.boxEl.style, {
      left: `${x1}px`, top: `${y1}px`,
      width: `${Math.abs(ev.clientX - this.boxStart.x)}px`,
      height: `${Math.abs(ev.clientY - this.boxStart.y)}px`,
    });
  }

  onPointerUp(ev) {
    if (!this.boxStart) return;
    const start = this.boxStart;
    this.endBox();
    const w = Math.abs(ev.clientX - start.x), h = Math.abs(ev.clientY - start.y);
    if (w < 5 && h < 5) {
      if (!start.shift) this.app.select(null); // simple empty click
      return;
    }
    const app = this.app;
    const canvas = app.viewport.canvas.getBoundingClientRect();
    const minX = Math.min(start.x, ev.clientX) - canvas.left;
    const maxX = Math.max(start.x, ev.clientX) - canvas.left;
    const minY = Math.min(start.y, ev.clientY) - canvas.top;
    const maxY = Math.max(start.y, ev.clientY) - canvas.top;

    if (!start.shift) app.select(null);
    const picked = new Set();
    for (const [id, obj] of app.model.objects) {
      const e = app.model.entities.get(id);
      if (!e || !obj.visible) continue;
      const box = new THREE.Box3().setFromObject(obj);
      if (box.isEmpty()) continue;
      let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
      for (const cx of [box.min.x, box.max.x])
        for (const cy of [box.min.y, box.max.y])
          for (const cz of [box.min.z, box.max.z]) {
            const s = app.viewport.worldToScreen(new THREE.Vector3(cx, cy, cz));
            bMinX = Math.min(bMinX, s.x); bMaxX = Math.max(bMaxX, s.x);
            bMinY = Math.min(bMinY, s.y); bMaxY = Math.max(bMaxY, s.y);
          }
      if (bMaxX >= minX && bMinX <= maxX && bMaxY >= minY && bMinY <= maxY) {
        for (const gid of app.groupIdsOf(id)) picked.add(gid);
      }
    }
    for (const id of picked) {
      if (!app.isSelected(id)) app.select(id, { additive: true });
    }
    app.ui.setHint(`${app.selection.size} selected. ` + this.hint);
  }

  endBox() {
    this.boxStart = null;
    this.boxEl?.remove();
    this.boxEl = null;
  }
}

// ---------------------------------------------------------------------------
// Push/Pull

export class PushPullTool extends Tool {
  get hint() {
    return this.mode
      ? 'Move to set depth, click to commit · type a distance + Enter · Esc cancels'
      : 'Push/Pull: click a flat shape to extrude it, or the top of a solid to change its height';
  }

  activate() { this.reset(); }
  deactivate() { this.cancel(); }

  reset() {
    this.mode = null;       // 'new' | 'adjust'
    this.entity = null;
    this.axisOrigin = null; // Vector3
    this.axisDir = null;    // Vector3 (world extrusion direction)
    this.startDepth = 0;
    this.lastDelta = 0;
  }

  cancel() {
    if (this.mode) this.app.history.revertToCheckpoint();
    this.reset();
    this.app.snapper?.hide();
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    if (this.mode) { this.commit(); return; }
    const app = this.app;
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables());
    if (!hit) return;
    const e = app.model.entities.get(hit.object.userData.entityId);
    if (!e) return;

    if (e.type === 'profile') {
      app.history.checkpoint();
      const n = planeNormal(e.plane);
      this.entity = app.model.entities.get(e.id);
      // convert in place: profile -> solid with ~zero depth
      this.entity.type = 'solid';
      this.entity.depth = 0.01;
      this.entity.transform = null;
      app.model.update(this.entity);
      this.mode = 'new';
      this.axisOrigin = hit.point.clone();
      this.axisDir = n;
      this.startDepth = 0;
    } else if (e.type === 'solid') {
      const fn = faceWorldNormal(hit);
      const rot = new THREE.Matrix4().extractRotation(solidMatrix(e));
      const n = planeNormal(e.plane).applyMatrix4(rot).normalize();
      const sign = e.depth >= 0 ? 1 : -1;
      if (fn.dot(n) * sign > 0.99) {
        // far cap — the face push/pull moves
        app.history.checkpoint();
        this.entity = e;
        this.mode = 'adjust';
        this.axisOrigin = hit.point.clone();
        this.axisDir = n.clone().multiplyScalar(sign); // outward
        this.startDepth = e.depth;
      } else {
        app.ui.setHint('Push/Pull works on the face the solid was extruded toward — try the opposite face.');
        return;
      }
    } else return;
    app.ui.setHint(this.hint);
  }

  onPointerMove(ev) {
    if (!this.mode || !this.entity) return;
    const t = dragDistanceAlongAxis(this.app.viewport, ev, this.axisOrigin, this.axisDir);
    const snapped = Math.round(t) === 0 && this.mode === 'new' ? t : Math.round(t * 4) / 4; // 1/4" steps
    this.applyDelta(snapped);
    this.app.ui.setCursorTip(ev, Units.format(Math.abs(this.currentDepth())));
  }

  currentDepth() { return this.entity?.depth ?? 0; }

  applyDelta(t) {
    this.lastDelta = t;
    const e = this.entity;
    if (this.mode === 'new') {
      e.depth = Math.abs(t) < 0.01 ? 0.01 : t;
    } else {
      const sign = this.startDepth >= 0 ? 1 : -1;
      let d = this.startDepth + sign * t;
      if (Math.abs(d) < 0.01) d = sign * 0.01;
      e.depth = d;
    }
    this.app.model.update(e);
  }

  onVCB(text) {
    if (!this.mode || !this.entity) return;
    const len = Units.parse(text);
    if (len == null) return;
    if (this.mode === 'new') {
      const dirSign = this.lastDelta < 0 ? -1 : 1;
      this.entity.depth = dirSign * Math.abs(len);
    } else {
      const sign = this.startDepth >= 0 ? 1 : -1;
      this.entity.depth = sign * Math.abs(len); // absolute height entry
    }
    this.app.model.update(this.entity);
    this.commit();
  }

  commit() {
    this.reset();
    this.app.ui.setHint('Done. ' + this.hint);
  }
}

// ---------------------------------------------------------------------------
// Move

export class MoveTool extends Tool {
  get hint() {
    return this.targets
      ? 'Move the mouse and click to place · Shift = vertical · type a distance + Enter · Esc cancels'
      : 'Move: click an object (Ctrl+click = copy) · after a move, type x5 + Enter to array';
  }

  activate() { this.reset(); this.lastMove = null; }
  deactivate() { this.cancel(); }

  reset() {
    this.targets = null;      // array of entities being moved
    this.startPoint = null;
    this.applied = new THREE.Vector3();
    this.lastDir = null;
  }

  cancel() {
    if (this.targets) this.app.history.revertToCheckpoint();
    this.reset();
    this.app.snapper?.hide();
  }

  drop() {
    if (this.applied.lengthSq() > 1e-9) {
      this.lastMove = { ids: this.targets.map(t => t.id), vector: this.applied.clone() };
    }
    this.reset();
    this.app.ui.setHint('Moved. Type x3 + Enter to repeat as an array. ' + this.hint);
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const app = this.app;
    if (this.targets) { this.drop(); return; }
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables(true));
    if (!hit) return;
    const e = app.model.entities.get(hit.object.userData.entityId);
    if (!e) return;
    app.history.checkpoint();

    // whole selection moves if the picked entity is part of it; else its group
    let ids = app.isSelected(e.id) && app.selection.size > 1
      ? [...app.selection]
      : app.groupIdsOf(e.id);
    if (ev.ctrlKey || ev.metaKey) {
      ids = cloneEntitiesRegrouped(app.model, ids).map(c => c.id); // move the copies
    }
    this.targets = ids.map(id => app.model.entities.get(id)).filter(Boolean);
    app.select(null);
    for (const id of ids) app.select(id, { additive: true });

    this.startPoint = hit.point.clone();
    this.movePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.point.y);
    app.ui.setHint(this.hint);
  }

  onPointerMove(ev) {
    if (!this.targets) return;
    const app = this.app;
    let target;
    if (ev.shiftKey) {
      const t = dragDistanceAlongAxis(app.viewport, ev, this.startPoint, new THREE.Vector3(0, 1, 0));
      target = this.startPoint.clone().add(new THREE.Vector3(0, Math.round(t), 0));
      app.snapper.showAxisLine(this.startPoint, target, 0x50b060);
    } else {
      const snap = app.snapper.resolve(ev, this.movePlane, this.startPoint, { allowVertices: true });
      if (!snap) return;
      target = snap.point;
    }
    const delta = target.clone().sub(this.startPoint).sub(this.applied);
    if (delta.lengthSq() > 1e-10) {
      this.app.model.batch(() => {
        for (const e of this.targets) { translateEntity(e, delta); this.app.model.update(e); }
      });
      this.applied.add(delta);
    }
    this.lastDir = target.clone().sub(this.startPoint);
    app.ui.setCursorTip(ev, Units.format(this.lastDir.length()));
  }

  onVCB(text) {
    // array: "x4" or "*4" after a completed move duplicates along the vector
    const arr = /^[x*](\d+)$/i.exec(String(text).trim());
    if (arr && !this.targets && this.lastMove) {
      const n = parseInt(arr[1]);
      if (n < 2 || n > 200) return;
      this.app.history.checkpoint();
      this.app.model.batch(() => {
        for (let k = 1; k < n; k++) {
          const copies = cloneEntitiesRegrouped(this.app.model, this.lastMove.ids);
          for (const copy of copies) {
            translateEntity(copy, this.lastMove.vector.clone().multiplyScalar(k));
            this.app.model.update(copy);
          }
        }
      });
      this.app.ui.setHint(`Array created (${n} total).`);
      return;
    }
    if (!this.targets || !this.lastDir || this.lastDir.lengthSq() < 1e-9) return;
    const len = Units.parse(text);
    if (len == null) return;
    const want = this.lastDir.clone().normalize().multiplyScalar(len);
    const delta = want.sub(this.applied);
    for (const e of this.targets) { translateEntity(e, delta); this.app.model.update(e); }
    this.applied.add(delta);
    this.drop();
  }
}

// ---------------------------------------------------------------------------
// Rotate (about the vertical axis)

export class RotateTool extends Tool {
  get hint() {
    if (!this.targets) return 'Rotate: click an object';
    if (!this.pivot) return 'Click the rotation center';
    if (!this.startRay) return 'Click a reference direction';
    return 'Move to rotate (15° snaps), click to commit · type degrees + Enter · Esc cancels';
  }

  activate() { this.reset(); }
  deactivate() { this.cancel(); }

  reset() {
    this.targets = null; this.pivot = null; this.startRay = null; this.applied = 0;
  }

  cancel() {
    if (this.targets && this.applied) this.app.history.revertToCheckpoint();
    this.reset();
    this.app.snapper?.hide();
  }

  groundAngle(ev) {
    const app = this.app;
    app.viewport.setPointerFromEvent(ev);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.pivot.y);
    const p = app.viewport.intersectPlane(plane);
    if (!p) return null;
    return Math.atan2(-(p.z - this.pivot.z), p.x - this.pivot.x);
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const app = this.app;
    if (!this.targets) {
      app.viewport.setPointerFromEvent(ev);
      const hit = app.viewport.pick(app.model.pickables(true));
      if (!hit) return;
      const e = app.model.entities.get(hit.object.userData.entityId);
      const ids = app.isSelected(e.id) && app.selection.size > 1
        ? [...app.selection]
        : app.groupIdsOf(e.id);
      this.targets = ids.map(id => app.model.entities.get(id)).filter(Boolean);
    } else if (!this.pivot) {
      const snap = app.snapper.resolve(ev, app.viewport.groundPlane);
      if (!snap) return;
      this.pivot = snap.point.clone();
      this.app.history.checkpoint();
    } else if (this.startRay == null) {
      const a = this.groundAngle(ev);
      if (a == null) return;
      this.startRay = a;
    } else {
      this.reset();
    }
    app.ui.setHint(this.hint);
  }

  onPointerMove(ev) {
    if (!this.targets || !this.pivot || this.startRay == null) return;
    const a = this.groundAngle(ev);
    if (a == null) return;
    let angle = a - this.startRay;
    const snap = Math.PI / 12; // 15°
    angle = Math.round(angle / snap) * snap;
    const delta = angle - this.applied;
    if (Math.abs(delta) > 1e-9) {
      this.app.model.batch(() => {
        for (const e of this.targets) { rotateEntityY(e, this.pivot, delta); this.app.model.update(e); }
      });
      this.applied = angle;
    }
    this.app.ui.setCursorTip(ev, `${Math.round(angle * 180 / Math.PI)}°`);
  }

  onVCB(text) {
    if (!this.targets || !this.pivot) return;
    const deg = parseFloat(text);
    if (isNaN(deg)) return;
    const target = deg * Math.PI / 180;
    for (const e of this.targets) { rotateEntityY(e, this.pivot, target - this.applied); this.app.model.update(e); }
    this.reset();
    this.app.ui.setHint('Rotated. ' + this.hint);
  }
}

// ---------------------------------------------------------------------------
// Dimension (tape measure that leaves an annotation)

export class DimensionTool extends Tool {
  get hint() {
    return this.p1
      ? 'Click the second point to place the dimension'
      : 'Dimension: click the first point (snaps to corners and midpoints)';
  }

  activate() { this.reset(); }
  deactivate() { this.reset(); }
  cancel() { this.reset(); }

  reset() { this.p1 = null; this.app.preview?.clear(); }

  snapAnywhere(ev) {
    // snap against vertices first; fall back to ground plane
    return this.app.snapper.resolve(ev, this.app.viewport.groundPlane, this.p1);
  }

  onPointerMove(ev) {
    const snap = this.snapAnywhere(ev);
    if (!snap) return;
    if (this.p1) {
      this.app.preview.showPolyline([this.p1, snap.point]);
      this.app.ui.setCursorTip(ev, Units.format(this.p1.distanceTo(snap.point)));
    }
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const snap = this.snapAnywhere(ev);
    if (!snap) return;
    if (!this.p1) {
      this.p1 = snap.point.clone();
    } else {
      const p2 = snap.point.clone();
      const len = this.p1.distanceTo(p2);
      if (len > 0.05) {
        this.app.history.checkpoint();
        this.app.model.addDimension({
          p1: this.p1.toArray(), p2: p2.toArray(),
          offset: 8, label: Units.format(len),
        });
      }
      this.reset();
    }
    this.app.ui.setHint(this.hint);
  }
}

// ---------------------------------------------------------------------------
// Eraser

export class EraserTool extends Tool {
  get hint() { return 'Eraser: click an object to delete it'; }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const app = this.app;
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables(true));
    if (!hit) return;
    const ids = app.groupIdsOf(hit.object.userData.entityId);
    app.history.checkpoint();
    app.model.batch(() => {
      for (const id of ids) { app.model.remove(id); app.deselect(id); }
    });
  }
}
