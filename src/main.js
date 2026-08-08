import './style.css';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

import { Viewport } from './core/viewport.js';
import { Model } from './core/model.js';
import { Snapper } from './core/snap.js';
import { History } from './core/history.js';
import { Preview } from './core/preview.js';
import { Units } from './core/units.js';

import { buildToolbar, TOOLS } from './ui/toolbar.js';
import { buildLayersPanel, renderEntityInfo, buildCutListPanel } from './ui/panels.js';
import { showSheetDialog } from './ui/sheetDialog.js';
import { showInsertDialog } from './ui/insertDialog.js';
import { modelToDXF } from './lib/dxf.js';

import { LineTool, RectTool, CircleTool } from './tools/drawTools.js';
import { InsertTool } from './tools/insertTool.js';
import { translateEntity } from './tools/common.js';
import {
  SelectTool, PushPullTool, MoveTool, RotateTool, DimensionTool, EraserTool,
} from './tools/modifyTools.js';

const $ = (sel) => document.querySelector(sel);

class App {
  constructor() {
    this.viewport = new Viewport($('#viewport'));
    this.model = new Model(this.viewport.scene);
    this.snapper = new Snapper(this.viewport, this.model);
    this.history = new History(this.model);
    this.preview = new Preview(this.viewport.scene);
    this.selection = new Set();
    this.clipboard = null;

    this.tools = {
      select: new SelectTool(this),
      line: new LineTool(this),
      rect: new RectTool(this),
      circle: new CircleTool(this),
      pushpull: new PushPullTool(this),
      insert: new InsertTool(this),
      move: new MoveTool(this),
      rotate: new RotateTool(this),
      dimension: new DimensionTool(this),
      eraser: new EraserTool(this),
    };
    this.activeTool = null;

    this.ui = {
      setHint: (t) => { $('#status-hint').textContent = t || ''; },
      setCursorTip: (ev, text) => {
        const tip = $('#cursor-tip');
        if (!text) { tip.style.display = 'none'; return; }
        const rect = this.viewport.canvas.getBoundingClientRect();
        tip.style.display = 'block';
        tip.style.left = `${ev.clientX - rect.left}px`;
        tip.style.top = `${ev.clientY - rect.top}px`;
        tip.textContent = text;
      },
    };

    this.toolbarUI = buildToolbar($('#toolbar'), (id) => this.setTool(id));
    this.layersUI = buildLayersPanel($('#layers-list'), $('#btn-add-layer'), this.model, this.history);
    this.cutListUI = buildCutListPanel($('#cutlist-body'), $('#btn-cutlist-csv'), this.model);

    this.model.onChange = () => {
      this.layersUI.render();
      this.cutListUI.render();
      this.renderEntityPanel();
    };

    this.bindEvents();
    this.setTool('line');
    this.model.changed();
    this.viewport.startLoop();
    this.ui.setHint('Welcome! Draw a rectangle (R), then Push/Pull (P) to make it 3D. Middle-drag orbits, right-drag pans, scroll zooms.');
  }

  setTool(id) {
    if (id === 'insert') {
      // the Steel tool is configured through its dialog first
      showInsertDialog((cfg) => {
        this.tools.insert.config = cfg;
        this._activateTool('insert');
      }, this.tools.insert.config);
      return;
    }
    this._activateTool(id);
  }

  _activateTool(id) {
    this.activeTool?.deactivate();
    this.preview.clear();
    this.snapper.hide();
    this.activeTool = this.tools[id];
    this.activeToolId = id;
    this.activeTool.activate();
    this.toolbarUI.setActive(id);
    this.ui.setHint(this.activeTool.hint);
    this.ui.setCursorTip({}, null);
  }

  // ---- selection ----------------------------------------------------------

  applyHighlight(id, on) {
    const obj = this.model.objects.get(id);
    obj?.traverse(c => {
      if (c.isMesh && c.material?.emissive) c.material.emissive.setHex(on ? 0x2a4d80 : 0x000000);
    });
  }

  /** select(null) clears; additive toggles membership. */
  select(id, { additive = false } = {}) {
    if (!additive) {
      for (const old of this.selection) this.applyHighlight(old, false);
      this.selection.clear();
    }
    if (id) {
      if (additive && this.selection.has(id)) {
        this.selection.delete(id);
        this.applyHighlight(id, false);
      } else {
        this.selection.add(id);
        this.applyHighlight(id, true);
      }
    }
    this.renderEntityPanel();
  }

  deselect(id) {
    if (this.selection.delete(id)) this.renderEntityPanel();
  }

  isSelected(id) { return this.selection.has(id); }

  renderEntityPanel() {
    // prune stale ids, re-apply highlights (rebuilt objects lose emissive)
    for (const id of [...this.selection]) {
      if (!this.model.entities.get(id)) this.selection.delete(id);
      else this.applyHighlight(id, true);
    }
    renderEntityInfo($('#entity-info'), this.model, this.selection, {
      onEdit: (id, patch) => {
        const e = this.model.entities.get(id);
        if (!e) return;
        this.history.checkpoint();
        Object.assign(e, patch);
        this.model.update(e);
      },
    });
  }

  modelBounds() {
    const b = new THREE.Box3();
    for (const [id, obj] of this.model.objects) {
      const e = this.model.entities.get(id);
      if (e && (e.type === 'solid' || e.type === 'profile') && obj.visible) b.expandByObject(obj);
    }
    return b;
  }

  bindEvents() {
    const canvas = this.viewport.canvas;
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.button === 0) this.activeTool?.onPointerDown(ev);
    });
    canvas.addEventListener('pointermove', (ev) => {
      this.activeTool?.onPointerMove(ev);
      this.updateCoords(ev);
    });
    canvas.addEventListener('pointerup', (ev) => this.activeTool?.onPointerUp(ev));
    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

    window.addEventListener('keydown', (ev) => {
      const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (ev.key === 'Escape') {
        this.activeTool?.cancel();
        this.select(null);
        this.preview.clear();
        this.snapper.hide();
        this.ui.setHint(this.activeTool.hint);
        this.ui.setCursorTip({}, null);
        document.activeElement?.blur?.();
        return;
      }
      if (inField) return;

      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') {
        ev.preventDefault();
        ev.shiftKey ? this.history.redo() : this.history.undo();
        this.select(null);
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') {
        ev.preventDefault(); this.history.redo(); this.select(null); return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault(); this.saveProject(); return;
      }
      if (ev.key === 'Delete' || ev.key === 'Backspace') {
        if (this.selection.size) {
          this.history.checkpoint();
          for (const id of [...this.selection]) this.model.remove(id);
          this.select(null);
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'c') {
        if (this.selection.size) {
          this.clipboard = [...this.selection]
            .map(id => this.model.entities.get(id))
            .filter(Boolean)
            .map(e => JSON.stringify(e));
          this.ui.setHint(`Copied ${this.clipboard.length} object(s). Ctrl+V to paste.`);
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'v') {
        if (this.clipboard?.length) {
          this.history.checkpoint();
          this.select(null);
          for (const json of this.clipboard) {
            const copy = JSON.parse(json);
            delete copy.id;
            const added = this.model[copy.type === 'dimension' ? 'addDimension' : copy.type === 'profile' ? 'addProfile' : 'addSolid'](copy);
            translateEntity(added, new THREE.Vector3(12, 0, 12));
            this.model.update(added);
            this.select(added.id, { additive: true });
          }
          this.ui.setHint('Pasted. Use Move (M) to position.');
        }
        return;
      }
      if (ev.shiftKey && ev.key.toLowerCase() === 'z') {
        this.viewport.zoomToFit(this.modelBounds());
        return;
      }
      // number/measurement/array typing focuses the VCB, SketchUp style
      if (/^[\d.'"*-]$/.test(ev.key) || (ev.key === 'x' && this.activeToolId === 'move')) {
        const vcb = $('#vcb');
        vcb.focus();
        return;
      }
      const tool = TOOLS.find(t => t.key === ev.key.toLowerCase());
      if (tool) { ev.preventDefault(); this.setTool(tool.id); return; }
      this.activeTool?.onKeyDown(ev);
    });

    // measurement box
    const vcb = $('#vcb');
    vcb.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        const text = vcb.value.trim();
        if (text) this.activeTool?.onVCB(text);
        vcb.value = '';
        vcb.blur();
      } else if (ev.key === 'Escape') {
        vcb.value = '';
        vcb.blur();
      }
    });

    $('#units-select').addEventListener('change', (ev) => {
      Units.mode = ev.target.value;
      // refresh dimension labels
      for (const e of this.model.entities.values()) {
        if (e.type === 'dimension') {
          const p1 = new THREE.Vector3(...e.p1), p2 = new THREE.Vector3(...e.p2);
          e.label = Units.format(p1.distanceTo(p2));
          this.model.rebuildObject(e);
        }
      }
      this.model.changed();
    });

    // top bar
    $('#btn-new').addEventListener('click', () => {
      if (!confirm('Start a new project? Unsaved work will be lost.')) return;
      this.history.checkpoint();
      this.model.clear();
      this.select(null);
    });
    $('#btn-save').addEventListener('click', () => this.saveProject());
    $('#btn-open').addEventListener('click', () => $('#file-open').click());
    $('#file-open').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        this.history.checkpoint();
        this.model.load(data);
        this.syncProjectInfoInputs();
        this.select(null);
        this.viewport.zoomToFit(this.modelBounds());
      } catch (err) {
        alert(`Could not open file: ${err.message}`);
      }
      ev.target.value = '';
    });
    $('#btn-undo').addEventListener('click', () => { this.history.undo(); this.select(null); });
    $('#btn-redo').addEventListener('click', () => { this.history.redo(); this.select(null); });
    $('#btn-sheet').addEventListener('click', () => showSheetDialog(this.model));
    $('#btn-export-stl').addEventListener('click', () => this.exportSTL());
    $('#btn-export-dxf').addEventListener('click', () => this.exportDXF());
    $('#btn-zoom-fit').addEventListener('click', () => this.viewport.zoomToFit(this.modelBounds()));
    document.querySelectorAll('#topbar .views [data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = this.modelBounds();
        this.viewport.setStandardView(btn.dataset.view, b.isEmpty() ? null : b);
      });
    });

    // project info fields
    for (const key of ['project', 'customer', 'author', 'number']) {
      $(`#pi-${key}`).addEventListener('input', (ev) => {
        this.model.projectInfo[key] = ev.target.value;
      });
    }
  }

  syncProjectInfoInputs() {
    for (const key of ['project', 'customer', 'author', 'number']) {
      $(`#pi-${key}`).value = this.model.projectInfo[key] || '';
    }
  }

  updateCoords(ev) {
    this.viewport.setPointerFromEvent(ev);
    const p = this.viewport.intersectGround();
    $('#status-coords').textContent = p
      ? `x ${Units.format(p.x)}   z ${Units.format(-p.z)}`
      : '';
  }

  saveProject() {
    const data = this.model.serialize();
    const name = (this.model.projectInfo.project || 'untitled').replace(/[^\w-]+/g, '_');
    downloadBlob(
      new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }),
      `${name}.cadshop.json`,
    );
    this.ui.setHint('Project saved.');
  }

  exportDXF() {
    const { text, count } = modelToDXF(this.model);
    if (!count) { alert('Nothing to export — draw some shapes or place some members first.'); return; }
    const name = (this.model.projectInfo.project || 'parts').replace(/[^\w-]+/g, '_');
    downloadBlob(new Blob([text], { type: 'application/dxf' }), `${name}.dxf`);
    this.ui.setHint(`Exported ${count} flat part profile(s) to DXF (inches).`);
  }

  exportSTL() {
    const exporter = new STLExporter();
    const group = new THREE.Group();
    for (const [id, obj] of this.model.objects) {
      const e = this.model.entities.get(id);
      if (!e || e.type !== 'solid' || !obj.visible) continue;
      obj.updateWorldMatrix(true, true);
      obj.traverse(c => {
        if (c.isMesh) {
          const m = new THREE.Mesh(c.geometry.clone());
          m.geometry.applyMatrix4(c.matrixWorld);
          group.add(m);
        }
      });
    }
    if (!group.children.length) { alert('No solids to export yet.'); return; }
    const stl = exporter.parse(group, { binary: true });
    const name = (this.model.projectInfo.project || 'model').replace(/[^\w-]+/g, '_');
    downloadBlob(new Blob([stl], { type: 'model/stl' }), `${name}.stl`);
  }
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

new App();
