import * as THREE from 'three';
import { Tool, sketchPlaneFromHit, threePlane } from './common.js';
import { worldToPlane, planeToWorld, GROUND_PLANE } from '../core/model.js';
import { Units } from '../core/units.js';

// Shared behavior for tools that sketch a closed profile on a plane.
// The sketch plane is picked on the first click: a solid face if the
// cursor is over one, otherwise the ground.

class SketchTool extends Tool {
  activate() { this.reset(); }
  deactivate() { this.reset(); }
  cancel() { this.reset(); }

  reset() {
    this.plane = null;       // {origin,u,v}
    this.tPlane = null;      // THREE.Plane
    this.points = [];        // Vector2 in plane coords
    this.lastWorld = null;   // Vector3 of previous point (for axis inference)
    this.app.preview.clear();
    this.app.snapper?.hide();
  }

  /**
   * AutoCAD-style typed coordinates from the command line.
   * coord = {x,y,rel} or {polar:true,d,a}. Feeds placePoint2().
   */
  onCoordinate(coord) {
    if (!this.plane) this.beginOnPlane(GROUND_PLANE());
    const last = this.lastWorld ? this.toPlane(this.lastWorld.clone()) : new THREE.Vector2(0, 0);
    let p2;
    if (coord.polar) {
      const a = (coord.a * Math.PI) / 180;
      p2 = last.clone().add(new THREE.Vector2(Math.cos(a) * coord.d, Math.sin(a) * coord.d));
    } else if (coord.rel) {
      p2 = last.clone().add(new THREE.Vector2(coord.x, coord.y));
    } else {
      p2 = new THREE.Vector2(coord.x, coord.y);
    }
    this.placePoint2(p2);
    this.app.ui.setHint(this.hint);
  }

  placePoint2(_p2) {} // implemented by each tool

  resolvePoint(ev) {
    const app = this.app;
    if (!this.plane) {
      // hover: pick plane under cursor for preview/snap
      app.viewport.setPointerFromEvent(ev);
      const hit = app.viewport.pick(app.model.pickables());
      const plane = sketchPlaneFromHit(hit);
      return { snap: app.snapper.resolve(ev, threePlane(plane)), plane };
    }
    return { snap: app.snapper.resolve(ev, this.tPlane, this.lastWorld), plane: this.plane };
  }

  beginOnPlane(plane) {
    this.plane = plane;
    this.tPlane = threePlane(plane);
  }

  toPlane(worldPoint) {
    const p = worldPoint.clone();
    this.tPlane.projectPoint(worldPoint, p);
    return worldToPlane(this.plane, p);
  }
}

// ---------------------------------------------------------------------------

export class LineTool extends SketchTool {
  acceptsAbsoluteCoords = true;

  get hint() {
    return this.points.length
      ? 'Click next point — close on the first point · hold Shift to lock the axis · length or "@dx,dy" + Enter · Esc cancels'
      : 'Line: click to start a shape on the ground or on a face (or type "x,y" + Enter)';
  }

  onPointerMove(ev) {
    const { snap } = this.resolvePoint(ev);
    if (!snap) return;
    if (this.points.length) {
      const pts = this.points.map(p => planeToWorld(this.plane, p.x, p.y));
      this.app.preview.showPolyline([...pts, snap.point]);
      const d = snap.point.distanceTo(this.lastWorld);
      this.app.ui.setCursorTip(ev, Units.format(d));
    } else {
      this.app.ui.setCursorTip(ev, null);
    }
    this._lastSnap = snap;
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const { snap, plane } = this.resolvePoint(ev);
    if (!snap) return;
    if (!this.plane) this.beginOnPlane(plane);
    this.placePoint2(this.toPlane(snap.point));
    this.app.ui.setHint(this.hint);
  }

  placePoint2(p2) {
    // ignore duplicate clicks (e.g. the second click of a double-click)
    const last = this.points[this.points.length - 1];
    if (last && p2.distanceTo(last) < 0.05) return;
    // close the loop?
    if (this.points.length >= 3 && p2.distanceTo(this.points[0]) < 1.5) {
      this.finish();
      return;
    }
    this.points.push(p2);
    this.lastWorld = planeToWorld(this.plane, p2.x, p2.y);
  }

  onDoubleClick() {
    if (this.points.length >= 3) this.finish();
  }

  onVCB(text) {
    // move the last placed point to an exact distance from the previous one
    const len = Units.parse(text);
    if (len == null || !this._lastSnap || !this.lastWorld) return;
    const dir = this._lastSnap.point.clone().sub(this.lastWorld);
    if (dir.lengthSq() < 1e-9) return;
    dir.normalize();
    const world = this.lastWorld.clone().addScaledVector(dir, len);
    this.placePoint2(this.toPlane(world));
  }

  finish() {
    if (this.points.length >= 3) {
      this.app.history.checkpoint();
      this.app.model.addProfile({
        kind: 'poly',
        plane: this.plane,
        points: this.points.map(p => [p.x, p.y]),
      });
    }
    this.reset();
    this.app.ui.setHint('Shape closed. Use Push/Pull (P) to give it depth.');
  }

  onKeyDown(ev) {
    if (ev.key === 'Enter' && this.points.length >= 3) this.finish();
  }
}

// ---------------------------------------------------------------------------

export class RectTool extends SketchTool {
  get hint() {
    return this.corner
      ? 'Click the opposite corner · type “w, h” + Enter for exact size'
      : 'Rectangle: click the first corner (on the ground or on a face)';
  }

  reset() { super.reset(); this.corner = null; }

  onPointerMove(ev) {
    const { snap } = this.resolvePoint(ev);
    if (!snap) return;
    this._lastSnap = snap;
    if (this.corner) {
      const c2 = this.toPlane(snap.point);
      const pts = rectPoints(this.corner, c2).map(p => planeToWorld(this.plane, p.x, p.y));
      this.app.preview.showPolyline([...pts, pts[0]]);
      const w = Math.abs(c2.x - this.corner.x), h = Math.abs(c2.y - this.corner.y);
      this.app.ui.setCursorTip(ev, `${Units.format(w)} × ${Units.format(h)}`);
    }
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const { snap, plane } = this.resolvePoint(ev);
    if (!snap) return;
    if (!this.plane) this.beginOnPlane(plane);
    this.placePoint2(this.toPlane(snap.point));
  }

  placePoint2(p2) {
    if (!this.corner) {
      this.corner = p2;
      this.lastWorld = planeToWorld(this.plane, p2.x, p2.y);
      this.app.ui.setHint(this.hint);
    } else {
      this.commit(p2);
    }
  }

  onVCB(text) {
    if (!this.corner) return;
    const parts = String(text).split(/[,x]/i);
    if (parts.length !== 2) return;
    const w = Units.parse(parts[0]), h = Units.parse(parts[1]);
    if (w == null || h == null) return;
    // grow in the direction the cursor is dragging (default +,+)
    const cur = this._lastSnap ? this.toPlane(this._lastSnap.point) : this.corner.clone().add(new THREE.Vector2(1, 1));
    const sx = cur.x >= this.corner.x ? 1 : -1;
    const sy = cur.y >= this.corner.y ? 1 : -1;
    this.commit(new THREE.Vector2(this.corner.x + sx * w, this.corner.y + sy * h));
  }

  commit(c2) {
    if (Math.abs(c2.x - this.corner.x) < 0.01 || Math.abs(c2.y - this.corner.y) < 0.01) return;
    this.app.history.checkpoint();
    this.app.model.addProfile({
      kind: 'poly',
      plane: this.plane,
      points: rectPoints(this.corner, c2).map(p => [p.x, p.y]),
    });
    this.reset();
    this.app.ui.setHint('Rectangle drawn. Push/Pull (P) to extrude.');
  }
}

function rectPoints(a, b) {
  return [
    new THREE.Vector2(a.x, a.y),
    new THREE.Vector2(b.x, a.y),
    new THREE.Vector2(b.x, b.y),
    new THREE.Vector2(a.x, b.y),
  ];
}

// ---------------------------------------------------------------------------

export class CircleTool extends SketchTool {
  get hint() {
    return this.center
      ? 'Click to set the radius · type a radius + Enter'
      : 'Circle: click the center point';
  }

  reset() { super.reset(); this.center = null; }

  onPointerMove(ev) {
    const { snap } = this.resolvePoint(ev);
    if (!snap) return;
    if (this.center) {
      const c2 = this.toPlane(snap.point);
      const r = c2.distanceTo(this.center);
      this.app.preview.showCircle(this.plane, this.center, r);
      this.app.ui.setCursorTip(ev, `R ${Units.format(r)}`);
    }
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const { snap, plane } = this.resolvePoint(ev);
    if (!snap) return;
    if (!this.plane) this.beginOnPlane(plane);
    this.placePoint2(this.toPlane(snap.point));
  }

  placePoint2(p2) {
    if (!this.center) {
      this.center = p2;
      this.lastWorld = planeToWorld(this.plane, p2.x, p2.y);
      this.app.ui.setHint(this.hint);
    } else {
      this.commit(p2.distanceTo(this.center));
    }
  }

  onVCB(text) {
    if (!this.center) return;
    const r = Units.parse(text);
    if (r != null && r > 0) this.commit(r);
  }

  commit(r) {
    if (r < 0.05) return;
    this.app.history.checkpoint();
    this.app.model.addProfile({
      kind: 'circle',
      plane: this.plane,
      center: [this.center.x, this.center.y],
      radius: r,
    });
    this.reset();
    this.app.ui.setHint('Circle drawn. Push/Pull (P) to extrude.');
  }
}

// ---------------------------------------------------------------------------

export class PolygonTool extends SketchTool {
  sides = 6;

  get hint() {
    return this.center
      ? `Polygon (${this.sides} sides): click to set the radius · type a radius, or "s8" to change sides`
      : `Polygon (${this.sides} sides): click the center · type "s8" + Enter to change sides`;
  }

  reset() { super.reset(); this.center = null; }

  onPointerMove(ev) {
    const { snap } = this.resolvePoint(ev);
    if (!snap) return;
    if (this.center) {
      const c2 = this.toPlane(snap.point);
      const r = c2.distanceTo(this.center);
      this.app.preview.showPolyline(this.outline(r));
      this.app.ui.setCursorTip(ev, `R ${Units.format(r)}`);
    }
  }

  outline(r) {
    const pts = [];
    for (let i = 0; i <= this.sides; i++) {
      const a = (i / this.sides) * Math.PI * 2 + Math.PI / 2;
      pts.push(planeToWorld(this.plane,
        this.center.x + Math.cos(a) * r,
        this.center.y + Math.sin(a) * r));
    }
    return pts;
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const { snap, plane } = this.resolvePoint(ev);
    if (!snap) return;
    if (!this.plane) this.beginOnPlane(plane);
    this.placePoint2(this.toPlane(snap.point));
  }

  placePoint2(p2) {
    if (!this.center) {
      this.center = p2;
      this.lastWorld = planeToWorld(this.plane, p2.x, p2.y);
      this.app.ui.setHint(this.hint);
    } else {
      this.commit(p2.distanceTo(this.center));
    }
  }

  onVCB(text) {
    const sides = /^s(\d+)$/i.exec(String(text).trim());
    if (sides) {
      const n = parseInt(sides[1]);
      if (n >= 3 && n <= 64) { this.sides = n; this.app.ui.setHint(this.hint); }
      return;
    }
    if (!this.center) return;
    const r = Units.parse(text);
    if (r != null && r > 0) this.commit(r);
  }

  commit(r) {
    if (r < 0.05) return;
    this.app.history.checkpoint();
    const pts = [];
    for (let i = 0; i < this.sides; i++) {
      const a = (i / this.sides) * Math.PI * 2 + Math.PI / 2;
      pts.push([this.center.x + Math.cos(a) * r, this.center.y + Math.sin(a) * r]);
    }
    this.app.model.addProfile({ kind: 'poly', plane: this.plane, points: pts });
    this.reset();
    this.app.ui.setHint('Polygon drawn. Push/Pull (P) to extrude.');
  }
}
