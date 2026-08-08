import * as THREE from 'three';
import { Tool } from './common.js';
import { planeToWorld } from '../core/model.js';
import { Units } from '../core/units.js';

// Places configured stock members (angle, tube, beam, …) with a click.
// config = { profile: {kind, points|radius, holes?, innerRadius?, center?},
//            spec, length, axis: 'up'|'x'|'z', material }

const AXIS_PLANES = {
  up: p => ({ origin: p.toArray(), u: [1, 0, 0], v: [0, 0, -1] }), // extrudes +Y
  x:  p => ({ origin: p.toArray(), u: [0, 0, -1], v: [0, 1, 0] }), // extrudes +X
  z:  p => ({ origin: p.toArray(), u: [1, 0, 0], v: [0, 1, 0] }),  // extrudes +Z
};

export class InsertTool extends Tool {
  constructor(app) {
    super(app);
    this.config = null;
  }

  get hint() {
    if (!this.config) return 'Steel: choose a profile first (press I)';
    return `Placing ${this.config.spec} × ${Units.format(this.config.length)} — click to place, Esc to stop`;
  }

  deactivate() { this.app.preview.clear(); }
  cancel() { this.app.preview.clear(); }

  planeAt(point) {
    return AXIS_PLANES[this.config.axis || 'up'](point);
  }

  outlineWorld(plane) {
    const c = this.config.profile;
    const pts = [];
    if (c.kind === 'circle') {
      const [cx, cy] = c.center || [0, 0];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        pts.push(planeToWorld(plane, cx + Math.cos(a) * c.radius, cy + Math.sin(a) * c.radius));
      }
    } else {
      for (const [x, y] of c.points) pts.push(planeToWorld(plane, x, y));
      pts.push(pts[0].clone());
    }
    return pts;
  }

  onPointerMove(ev) {
    if (!this.config) return;
    const snap = this.app.snapper.resolve(ev, this.app.viewport.groundPlane);
    if (!snap) return;
    this.app.preview.showPolyline(this.outlineWorld(this.planeAt(snap.point)));
    this.app.ui.setCursorTip(ev, this.config.spec);
  }

  onPointerDown(ev) {
    if (ev.button !== 0 || !this.config) return;
    const snap = this.app.snapper.resolve(ev, this.app.viewport.groundPlane);
    if (!snap) return;
    const c = this.config;
    this.app.history.checkpoint();
    const solid = {
      plane: this.planeAt(snap.point),
      depth: c.length,
      spec: c.spec,
      material: c.material,
      kind: c.profile.kind,
    };
    if (c.profile.kind === 'circle') {
      solid.center = c.profile.center || [0, 0];
      solid.radius = c.profile.radius;
      if (c.profile.innerRadius) solid.innerRadius = c.profile.innerRadius;
    } else {
      solid.points = c.profile.points;
      if (c.profile.holes?.length) solid.holes = c.profile.holes;
    }
    this.app.model.addSolid(solid);
    this.app.ui.setHint(`Placed ${c.spec}. Click to place another, or Esc / another tool to stop.`);
  }

  onVCB(text) {
    // change the member length on the fly
    const len = Units.parse(text);
    if (len != null && len > 0 && this.config) {
      this.config.length = len;
      this.app.ui.setHint(this.hint);
    }
  }
}
