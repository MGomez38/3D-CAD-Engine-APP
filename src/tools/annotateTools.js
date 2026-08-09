import * as THREE from 'three';
import { Tool, translateEntity } from './common.js';
import { Units } from '../core/units.js';

// ---------------------------------------------------------------------------
// Section tool: live horizontal section cut through the model at any height.

export class SectionTool extends Tool {
  get hint() {
    return this.app.sectionY != null
      ? `Section cut at ${Units.format(this.app.sectionY)} — click to move it · type a height + Enter · type "off" or press Delete to clear`
      : 'Section: click the model (or the ground) to cut everything above that height';
  }

  onPointerMove(ev) {
    const app = this.app;
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables());
    const y = hit ? hit.point.y : 0;
    app.ui.setCursorTip(ev, `cut @ ${Units.format(y)}`);
  }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const app = this.app;
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables());
    const y = hit ? hit.point.y : app.viewport.intersectGround()?.y ?? 0;
    app.setSection(Math.round(y * 4) / 4);
    app.ui.setHint(this.hint);
  }

  onVCB(text) {
    if (/^(off|none|clear)$/i.test(text.trim())) {
      this.app.setSection(null);
    } else {
      const y = Units.parse(text);
      if (y != null) this.app.setSection(y);
    }
    this.app.ui.setHint(this.hint);
  }

  onKeyDown(ev) {
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      this.app.setSection(null);
      this.app.ui.setHint(this.hint);
    }
  }
}

// ---------------------------------------------------------------------------
// Component placement: stamp a saved component into the model. Each placement
// becomes its own group, anchored by the component's min corner on the ground.

export class ComponentTool extends Tool {
  constructor(app) {
    super(app);
    this.config = null; // { name, anchor, size, entities }
  }

  get hint() {
    return this.config
      ? `Placing "${this.config.name}" — click to place, Esc to stop`
      : 'Pick a component from the Components panel first';
  }

  deactivate() { this.app.preview.clear(); }
  cancel() { this.app.preview.clear(); }

  footprint(at) {
    const [w, , d] = this.config.size;
    const y = 0.5;
    return [
      new THREE.Vector3(at.x, y, at.z),
      new THREE.Vector3(at.x + w, y, at.z),
      new THREE.Vector3(at.x + w, y, at.z - d),
      new THREE.Vector3(at.x, y, at.z - d),
      new THREE.Vector3(at.x, y, at.z),
    ];
  }

  onPointerMove(ev) {
    if (!this.config) return;
    const snap = this.app.snapper.resolve(ev, this.app.viewport.groundPlane);
    if (!snap) return;
    this.app.preview.showPolyline(this.footprint(snap.point));
    this.app.ui.setCursorTip(ev, this.config.name);
  }

  onPointerDown(ev) {
    if (ev.button !== 0 || !this.config) return;
    const app = this.app;
    const snap = app.snapper.resolve(ev, app.viewport.groundPlane);
    if (!snap) return;
    const [ax, ay, az] = this.config.anchor;
    // click = south-west corner of the footprint, base dropped to the ground:
    // x aligns to min-x, z aligns to max-z (= min-z + depth)
    const delta = new THREE.Vector3(
      snap.point.x - ax, -ay, snap.point.z - (az + this.config.size[2]));
    app.history.checkpoint();
    const gid = `grp${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)}`;
    app.model.batch(() => {
      for (const src of this.config.entities) {
        const copy = JSON.parse(JSON.stringify(src));
        delete copy.id;
        copy.groupId = gid;
        const adder = copy.type === 'dimension' ? 'addDimension'
          : copy.type === 'label' ? 'addLabel'
          : copy.type === 'profile' ? 'addProfile' : 'addSolid';
        const added = app.model[adder](copy);
        translateEntity(added, delta);
        app.model.update(added);
      }
    });
    app.ui.setHint(`Placed "${this.config.name}" (${this.config.entities.length} parts). Click to place another.`);
  }
}

// ---------------------------------------------------------------------------
// Note tool: text callouts anchored in the model (weld notes, part callouts).

export class LabelTool extends Tool {
  get hint() { return 'Note: click a point on the model to attach a text callout'; }

  onPointerDown(ev) {
    if (ev.button !== 0) return;
    const app = this.app;
    const snap = app.snapper.resolve(ev, app.viewport.groundPlane);
    // prefer a point on the model surface if the cursor is over one
    app.viewport.setPointerFromEvent(ev);
    const hit = app.viewport.pick(app.model.pickables());
    const point = hit ? hit.point : snap?.point;
    if (!point) return;
    const text = prompt('Note text:', '');
    if (!text || !text.trim()) return;
    app.history.checkpoint();
    app.model.addLabel({ position: point.toArray(), text: text.trim() });
    app.ui.setHint('Note placed. Click to add another, or switch tools.');
  }
}
