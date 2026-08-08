import * as THREE from 'three';
import { Tool } from './common.js';
import { worldToPlane, solidMatrix } from '../core/model.js';
import { Units } from '../core/units.js';
import { Settings } from '../core/settings.js';

// ---------------------------------------------------------------------------
// Wall tool (Revit-style): click two points in plan; a wall rises to the
// default height/thickness (see Settings). The wall is a vertical solid whose
// profile is its elevation face, so doors/windows are just holes in it.

export class WallTool extends Tool {
  acceptsAbsoluteCoords = true;

  get hint() {
    return this.p1
      ? `Wall to… click the end point · length or "@dx,dy" + Enter (H ${Units.format(Settings.wallHeight)}, T ${Units.format(Settings.wallThickness)})`
      : `Wall: click the start point (H ${Units.format(Settings.wallHeight)}, T ${Units.format(Settings.wallThickness)} — change in Settings)`;
  }

  activate() { this.reset(); }
  deactivate() { this.reset(); }
  cancel() { this.reset(); }

  reset() {
    this.p1 = null;
    this._lastSnap = null;
    this.app.preview?.clear();
    this.app.snapper?.hide();
  }

  onPointerMove(ev) {
    const snap = this.app.snapper.resolve(ev, this.app.viewport.groundPlane, this.p1);
    if (!snap) return;
    this._lastSnap = snap;
    if (this.p1) {
      this.app.preview.showPolyline([this.p1, snap.point]);
      this.app.ui.setCursorTip(ev, Units.format(this.p1.distanceTo(snap.point)));
    }
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const snap = this.app.snapper.resolve(ev, this.app.viewport.groundPlane, this.p1);
    if (!snap) return;
    if (!this.p1) {
      this.p1 = snap.point.clone();
      this.p1.y = 0;
    } else {
      const p2 = snap.point.clone();
      p2.y = 0;
      this.commitWall(this.p1, p2);
      this.p1 = p2; // chain walls like Revit
    }
    this.app.ui.setHint(this.hint);
  }

  onVCB(text) {
    // exact length along the current cursor direction
    if (!this.p1 || !this._lastSnap) return;
    const len = Units.parse(text);
    if (len == null || len <= 0) return;
    const dir = this._lastSnap.point.clone().setY(0).sub(this.p1);
    if (dir.lengthSq() < 1e-9) return;
    const p2 = this.p1.clone().addScaledVector(dir.normalize(), len);
    this.commitWall(this.p1, p2);
    this.p1 = p2;
    this.app.ui.setHint(this.hint);
  }

  onCoordinate(coord) {
    // plan coordinates: x = east (X), y = north (−Z)
    const toWorld = (x, y) => new THREE.Vector3(x, 0, -y);
    let p;
    if (coord.polar) {
      if (!this.p1) return;
      const a = (coord.a * Math.PI) / 180;
      p = this.p1.clone().add(toWorld(Math.cos(a) * coord.d, Math.sin(a) * coord.d).sub(new THREE.Vector3()));
    } else if (coord.rel) {
      if (!this.p1) return;
      p = this.p1.clone().add(toWorld(coord.x, coord.y));
    } else {
      p = toWorld(coord.x, coord.y);
    }
    if (!this.p1) { this.p1 = p; }
    else { this.commitWall(this.p1, p); this.p1 = p; }
    this.app.ui.setHint(this.hint);
  }

  commitWall(p1, p2) {
    const dir = p2.clone().sub(p1);
    const L = dir.length();
    if (L < 1) return;
    dir.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = dir.clone().cross(up); // horizontal, perpendicular to the wall
    const t = Settings.wallThickness, H = Settings.wallHeight;
    const origin = p1.clone().addScaledVector(normal, -t / 2); // center on the line

    this.app.history.checkpoint();
    this.app.model.addSolid({
      kind: 'poly',
      plane: { origin: origin.toArray(), u: dir.toArray(), v: [0, 1, 0] },
      points: [[0, 0], [L, 0], [L, H], [0, H]],
      depth: t,
      name: `Wall ${Units.format(L)}`,
      noBom: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Opening tool: click a wall to cut a door or window hole into it.
// config = { kind: 'door'|'window', w, h, sill }

export class OpeningTool extends Tool {
  constructor(app) {
    super(app);
    this.config = { kind: 'door', w: 36, h: 80, sill: 36 };
  }

  get hint() {
    const c = this.config;
    return c.kind === 'door'
      ? `Door ${Units.format(c.w)} × ${Units.format(c.h)}: click a wall to place (press O to change)`
      : `Window ${Units.format(c.w)} × ${Units.format(c.h)}, sill ${Units.format(c.sill)}: click a wall to place`;
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const app = this.app;
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables());
    if (!hit) return;
    const e = app.model.entities.get(hit.object.userData.entityId);
    if (!e || e.type !== 'solid' || e.kind !== 'poly') {
      app.ui.setHint('Openings go into walls — click a wall face.');
      return;
    }
    // wall-like = vertical profile plane (normal is horizontal)
    const u = new THREE.Vector3(...e.plane.u), v = new THREE.Vector3(...e.plane.v);
    const n = u.clone().cross(v);
    if (Math.abs(n.y) > 0.3) {
      app.ui.setHint('That face is not vertical — openings go into walls.');
      return;
    }

    // hit point in the wall's profile coordinates
    const local = hit.point.clone().applyMatrix4(solidMatrix(e).invert());
    const p = worldToPlane(e.plane, local);

    // profile bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of e.points) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }

    const c = this.config;
    const margin = 1;
    const w = Math.min(c.w, maxX - minX - 2 * margin);
    if (w < 4) { app.ui.setHint('Wall is too short for this opening.'); return; }
    let cx = Math.max(minX + margin + w / 2, Math.min(p.x, maxX - margin - w / 2));

    let y0, y1;
    if (c.kind === 'door') {
      y0 = minY;
      y1 = Math.min(minY + c.h, maxY - margin);
    } else {
      y0 = Math.max(minY + c.sill, minY + margin);
      y1 = Math.min(y0 + c.h, maxY - margin);
    }
    if (y1 - y0 < 4) { app.ui.setHint('Wall is too low for this opening.'); return; }

    const hole = [
      [cx - w / 2, y0], [cx - w / 2, y1], [cx + w / 2, y1], [cx + w / 2, y0],
    ];
    // reject overlap with existing openings
    for (const existing of e.holes || []) {
      let exMinX = Infinity, exMaxX = -Infinity;
      for (const [x] of existing) { exMinX = Math.min(exMinX, x); exMaxX = Math.max(exMaxX, x); }
      if (cx - w / 2 < exMaxX + margin && cx + w / 2 > exMinX - margin) {
        app.ui.setHint('That overlaps an existing opening — pick another spot.');
        return;
      }
    }

    app.history.checkpoint();
    e.holes = [...(e.holes || []), hole];
    app.model.update(e);
    app.ui.setHint(`${c.kind === 'door' ? 'Door' : 'Window'} placed. ` + this.hint);
  }
}
