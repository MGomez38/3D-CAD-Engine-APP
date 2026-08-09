import { Tool } from './common.js';
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
