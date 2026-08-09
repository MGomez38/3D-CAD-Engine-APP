import * as THREE from 'three';
import { Tool } from './common.js';
import { generateRailing } from '../lib/railing.js';
import { Units } from '../core/units.js';

// Railing tool: click a path along the ground, Enter / double-click builds the
// full guardrail or handrail (posts, rails, infill, baseplates) in one shot.
// config comes from the railing dialog (see ui/railingDialog.js).

export class RailTool extends Tool {
  constructor(app) {
    super(app);
    this.config = null;
    this.reset();
  }

  get hint() {
    if (!this.config) return 'Railing: choose a system first (press B)';
    if (!this.path.length) {
      return `${this.config.label}: click the start of the run (Shift/arrows lock axes)`;
    }
    return 'Click the next corner · Enter or double-click builds the railing · type a length + Enter · Esc cancels';
  }

  activate() { this.reset(); }
  deactivate() { this.reset(); }
  cancel() { this.reset(); }

  reset() {
    this.path = [];
    this._lastSnap = null;
    this.app?.preview?.clear();
    this.app?.snapper?.hide();
    this.hideChip();
  }

  /** Floating confirm button so nobody has to guess about the Enter key. */
  showChip() {
    if (this.chip) return;
    this.chip = document.createElement('button');
    this.chip.id = 'rail-confirm';
    this.chip.className = 'confirm-chip';
    this.chip.textContent = '✓ Build railing';
    this.chip.title = 'Or press Enter / double-click';
    this.chip.addEventListener('click', () => this.commit());
    document.getElementById('viewport-wrap').appendChild(this.chip);
  }

  hideChip() {
    this.chip?.remove();
    this.chip = null;
  }

  lastPoint3() {
    const p = this.path[this.path.length - 1];
    return p ? new THREE.Vector3(p.x, 0, p.z) : null;
  }

  onPointerMove(ev) {
    if (!this.config) return;
    const snap = this.app.snapper.resolve(ev, this.app.viewport.groundPlane, this.lastPoint3());
    if (!snap) return;
    this._lastSnap = snap;
    if (this.path.length) {
      const pts = this.path.map(p => new THREE.Vector3(p.x, 0.5, p.z));
      this.app.preview.showPolyline([...pts, snap.point.clone().setY(0.5)]);
      const last = this.path[this.path.length - 1];
      const len = Math.hypot(snap.point.x - last.x, snap.point.z - last.z);
      this.app.ui.setCursorTip(ev, Units.format(len));
    }
  }

  onPointerDown(ev) {
    if (ev.button !== 0 || !this.config) return;
    const snap = this.app.snapper.resolve(ev, this.app.viewport.groundPlane, this.lastPoint3());
    if (!snap) return;
    this.addPoint(snap.point.x, snap.point.z);
  }

  addPoint(x, z) {
    const last = this.path[this.path.length - 1];
    if (last && Math.hypot(x - last.x, z - last.z) < 0.5) return; // dedupe dbl-click
    this.path.push({ x, z });
    if (this.path.length >= 2) this.showChip();
    this.app.ui.setHint(this.hint);
  }

  onVCB(text) {
    // exact segment length along the current cursor direction
    if (!this.path.length || !this._lastSnap) return;
    const len = Units.parse(text);
    if (len == null || len <= 0) return;
    const last = this.path[this.path.length - 1];
    const dx = this._lastSnap.point.x - last.x, dz = this._lastSnap.point.z - last.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    this.addPoint(last.x + (dx / d) * len, last.z + (dz / d) * len);
  }

  onKeyDown(ev) {
    if (ev.key === 'Enter') this.commit();
  }

  onDoubleClick() { this.commit(); }

  commit() {
    if (!this.config || this.path.length < 2) return;
    const { entities, warnings } = generateRailing(this.path, this.config);
    if (!entities.length) {
      this.app.ui.setHint(warnings.join(' ') || 'Nothing to build — path too short.');
      this.reset();
      return;
    }
    this.app.history.checkpoint();
    const groupId = `grp${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)}`;
    this.app.model.batch(() => {
      for (const e of entities) this.app.model.addSolid({ ...e, groupId });
    });
    const note = warnings.length ? `  ⚠ ${warnings.join(' ')}` : '';
    this.app.ui.setHint(`Railing built — ${entities.length} parts added to the cut list.${note}`);
    this.reset();
  }
}
