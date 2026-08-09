import './style.css';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

import { Viewport } from './core/viewport.js';
import { Model } from './core/model.js';
import { Snapper } from './core/snap.js';
import { History } from './core/history.js';
import { Preview } from './core/preview.js';
import { Units } from './core/units.js';

import { Settings, loadSettings, saveSettings } from './core/settings.js';
import { buildToolbar, TOOLS } from './ui/toolbar.js';
import { buildLayersPanel, renderEntityInfo, buildCutListPanel, buildScenesPanel } from './ui/panels.js';
import { showSheetDialog } from './ui/sheetDialog.js';
import { showInsertDialog } from './ui/insertDialog.js';
import { showOpeningDialog } from './ui/openingDialog.js';
import { showSettingsDialog } from './ui/settingsDialog.js';
import { showHelpDialog, showWelcomeBanner } from './ui/helpDialog.js';
import { showRailingDialog } from './ui/railingDialog.js';
import { buildCommandPalette } from './ui/commandPalette.js';
import { modelToDXF } from './lib/dxf.js';
import { exampleProject } from './lib/example.js';
import { RailTool } from './tools/railTool.js';

import { LineTool, RectTool, CircleTool, PolygonTool } from './tools/drawTools.js';
import { InsertTool } from './tools/insertTool.js';
import { WallTool, OpeningTool } from './tools/wallTool.js';
import { SectionTool, LabelTool } from './tools/annotateTools.js';
import { translateEntity } from './tools/common.js';
import {
  SelectTool, PushPullTool, MoveTool, RotateTool, DimensionTool, EraserTool,
} from './tools/modifyTools.js';

// AutoCAD-style command aliases → tool ids
const TOOL_COMMANDS = {
  line: 'line', l: 'line', pline: 'line', pl: 'line',
  rect: 'rect', rec: 'rect', rectangle: 'rect',
  circle: 'circle', c: 'circle',
  polygon: 'polygon', pol: 'polygon', pg: 'polygon',
  pushpull: 'pushpull', pp: 'pushpull', extrude: 'pushpull', ex: 'pushpull',
  move: 'move', m: 'move',
  rotate: 'rotate', ro: 'rotate',
  erase: 'eraser', e: 'eraser',
  dim: 'dimension', dimension: 'dimension', dli: 'dimension',
  wall: 'wall', w: 'wall',
  opening: 'opening', door: 'opening', window: 'opening',
  rail: 'rail', railing: 'rail', guard: 'rail', guardrail: 'rail', handrail: 'rail', b: 'rail',
  section: 'section', cut: 'section', x: 'section',
  label: 'label', note: 'label', text: 'label', n: 'label',
  steel: 'insert', insert: 'insert', i: 'insert',
  select: 'select', sel: 'select',
};

/** Parse "24,12" / "@24,12" / "@48<45" AutoCAD-style coordinate input. */
function parseCoordInput(text) {
  const t = String(text).trim();
  const rel = t.startsWith('@');
  const body = rel ? t.slice(1) : t;
  const polar = body.match(/^(-?[\d.'"\s/]+)<(-?[\d.]+)$/);
  if (polar) {
    const d = Units.parse(polar[1]);
    const a = parseFloat(polar[2]);
    if (d == null || isNaN(a)) return null;
    return { polar: true, d, a };
  }
  const parts = body.split(',');
  if (parts.length !== 2) return null;
  const x = Units.parse(parts[0]), y = Units.parse(parts[1]);
  if (x == null || y == null) return null;
  return { rel, x, y };
}

const $ = (sel) => document.querySelector(sel);

class App {
  constructor() {
    loadSettings();
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
      polygon: new PolygonTool(this),
      wall: new WallTool(this),
      opening: new OpeningTool(this),
      rail: new RailTool(this),
      move: new MoveTool(this),
      rotate: new RotateTool(this),
      dimension: new DimensionTool(this),
      label: new LabelTool(this),
      section: new SectionTool(this),
      eraser: new EraserTool(this),
    };
    this.sectionY = null;
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
    this.scenesUI = buildScenesPanel($('#scenes-list'), $('#btn-add-scene'), this.model, this.viewport);

    this.model.onChange = () => {
      this.layersUI.render();
      this.cutListUI.render();
      this.scenesUI.render();
      this.renderEntityPanel();
      this.applyDisplayStyle();
      this.scheduleAutosave();
    };

    this.bindEvents();
    this.palette = buildCommandPalette([
      ...TOOLS.map(t => ({ id: t.id, title: `Tool: ${t.label}`, hint: t.keyLabel, run: () => this.setTool(t.id) })),
      { title: 'Drawing Sheet… (PDF)', run: () => showSheetDialog(this.model) },
      { title: 'Export DXF (flat parts)', run: () => this.exportDXF() },
      { title: 'Export STL', run: () => this.exportSTL() },
      { title: 'Save project', hint: 'Ctrl+S', run: () => this.saveProject() },
      { title: 'Open project', run: () => $('#file-open').click() },
      { title: 'New project', run: () => $('#btn-new').click() },
      { title: 'Undo', hint: 'Ctrl+Z', run: () => { this.history.undo(); this.select(null); } },
      { title: 'Redo', hint: 'Ctrl+Y', run: () => { this.history.redo(); this.select(null); } },
      { title: 'Zoom to fit', hint: 'Shift+Z', run: () => this.viewport.zoomToFit(this.modelBounds()) },
      { title: 'Settings', run: () => showSettingsDialog() },
      { title: 'Help & shortcuts', hint: 'H', run: () => showHelpDialog(this) },
      { title: 'Load example project', run: () => this.loadExample() },
    ]);
    $('#btn-palette').addEventListener('click', () => this.palette.open());
    this.setTool('line');
    this.restoreAutosave();
    this.model.changed();
    this.viewport.startLoop();
    showWelcomeBanner(this);
    this.ui.setHint('Welcome! Draw a rectangle (R), then Push/Pull (P) to make it 3D. Middle-drag orbits, right-drag pans, scroll zooms. Press H for help.');
  }

  loadExample() {
    this.history.checkpoint();
    this.model.load(exampleProject());
    this.syncProjectInfoInputs();
    this.select(null);
    this.viewport.zoomToFit(this.modelBounds());
    this.ui.setHint('Example loaded — click parts to inspect them, check the Cut List, or try Drawing Sheet…');
  }

  // ---- autosave -----------------------------------------------------------

  scheduleAutosave() {
    if (!Settings.autosave) return;
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem('cadshop-autosave', JSON.stringify(this.model.serialize()));
        const ind = $('#autosave-ind');
        ind.classList.add('show');
        clearTimeout(this._indTimer);
        this._indTimer = setTimeout(() => ind.classList.remove('show'), 1500);
      } catch { /* storage full */ }
    }, 800);
  }

  restoreAutosave() {
    try {
      const saved = localStorage.getItem('cadshop-autosave');
      if (!saved) return;
      const data = JSON.parse(saved);
      if (!data.entities?.length) return;
      if (confirm(`Restore your autosaved project (${data.entities.length} objects)?`)) {
        this.model.load(data);
        this.syncProjectInfoInputs();
        this.viewport.zoomToFit(this.modelBounds());
      } else {
        localStorage.removeItem('cadshop-autosave');
      }
    } catch { /* corrupted autosave */ }
  }

  // ---- display styles -----------------------------------------------------

  applyDisplayStyle() {
    const style = Settings.displayStyle;
    const clipPlanes = this.sectionY != null
      ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), this.sectionY)]
      : [];
    for (const [id, obj] of this.model.objects) {
      const e = this.model.entities.get(id);
      if (!e) continue;
      const isAnnotation = e.type === 'dimension' || e.type === 'label';
      const isProfile = e.type === 'profile';
      obj.traverse(c => {
        if (c.material) c.material.clippingPlanes = isAnnotation ? [] : clipPlanes;
        if (isAnnotation) return;
        if (c.isMesh && c.material) {
          const m = c.material;
          if (style === 'xray') {
            m.transparent = true; m.opacity = 0.4; m.depthWrite = false;
          } else if (style === 'wireframe') {
            m.transparent = true; m.opacity = 0.05; m.depthWrite = false;
          } else {
            m.transparent = isProfile; m.opacity = isProfile ? 0.85 : 1; m.depthWrite = true;
          }
        } else if (c.isLineSegments) {
          c.visible = style !== 'shaded';
        }
      });
    }
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
    if (id === 'opening') {
      showOpeningDialog((cfg) => {
        this.tools.opening.config = cfg;
        this._activateTool('opening');
      }, this.tools.opening.config);
      return;
    }
    if (id === 'rail') {
      showRailingDialog((cfg) => {
        this.tools.rail.config = cfg;
        this._activateTool('rail');
      }, this.tools.rail.config);
      return;
    }
    this._activateTool(id);
  }

  /** AutoCAD-style command line: returns true if the text was consumed. */
  handleCommand(text) {
    const lower = text.trim().toLowerCase();
    if (!lower) return false;

    if (TOOL_COMMANDS[lower]) { this.setTool(TOOL_COMMANDS[lower]); return true; }

    const ACTIONS = {
      u: () => { this.history.undo(); this.select(null); },
      undo: () => { this.history.undo(); this.select(null); },
      redo: () => { this.history.redo(); this.select(null); },
      z: () => this.viewport.zoomToFit(this.modelBounds()),
      zoom: () => this.viewport.zoomToFit(this.modelBounds()),
      fit: () => this.viewport.zoomToFit(this.modelBounds()),
      sheet: () => showSheetDialog(this.model),
      layout: () => showSheetDialog(this.model),
      dxf: () => this.exportDXF(),
      stl: () => this.exportSTL(),
      save: () => this.saveProject(),
      settings: () => showSettingsDialog(),
      config: () => showSettingsDialog(),
      help: () => showHelpDialog(this),
      example: () => this.loadExample(),
      units: () => $('#units-select').focus(),
    };
    if (ACTIONS[lower]) { ACTIONS[lower](); return true; }

    // coordinate entry: @dx,dy and @d<a always; plain x,y only for tools that opt in
    const coord = parseCoordInput(text);
    if (coord && this.activeTool?.onCoordinate) {
      const explicit = coord.rel || coord.polar;
      if (explicit || this.activeTool.acceptsAbsoluteCoords) {
        this.activeTool.onCoordinate(coord);
        return true;
      }
    }
    return false;
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

  /** All member ids of the entity's group (or just [id] if ungrouped). */
  groupIdsOf(id) {
    const e = this.model.entities.get(id);
    if (!e?.groupId) return [id];
    return [...this.model.entities.values()]
      .filter(x => x.groupId === e.groupId)
      .map(x => x.id);
  }

  groupSelection() {
    if (this.selection.size < 2) {
      this.ui.setHint('Select two or more objects (Shift+click or drag a box), then Ctrl+G groups them.');
      return;
    }
    this.history.checkpoint();
    const gid = `grp${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)}`;
    for (const id of this.selection) {
      const e = this.model.entities.get(id);
      if (e) e.groupId = gid;
    }
    this.model.changed();
    this.ui.setHint(`Grouped ${this.selection.size} objects — they now select and move as one.`);
  }

  ungroupSelection() {
    if (!this.selection.size) return;
    this.history.checkpoint();
    for (const id of this.selection) {
      const e = this.model.entities.get(id);
      if (e) delete e.groupId;
    }
    this.model.changed();
    this.ui.setHint('Ungrouped.');
  }

  /** Live horizontal section cut at height y (null clears it). */
  setSection(y) {
    this.sectionY = y;
    this.viewport.setSectionIndicator(y, this.modelBounds());
    this.applyDisplayStyle();
  }

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
      if (ev.button !== 0) return;
      if (this.viewport.viewHelper.handleClick(ev)) return; // orientation gizmo
      this.activeTool?.onPointerDown(ev);
    });
    canvas.addEventListener('pointermove', (ev) => {
      this.activeTool?.onPointerMove(ev);
      this.updateCoords(ev);
    });
    canvas.addEventListener('pointerup', (ev) => this.activeTool?.onPointerUp(ev));
    canvas.addEventListener('dblclick', (ev) => this.activeTool?.onDoubleClick?.(ev));
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

      // arrow keys toggle sticky axis locks (SketchUp-style)
      const ARROW_AXES = { ArrowRight: 'axis-x', ArrowLeft: 'axis-z', ArrowUp: 'axis-y' };
      if (ARROW_AXES[ev.key]) {
        ev.preventDefault();
        const lock = this.snapper.toggleStickyAxis(ARROW_AXES[ev.key]);
        const names = { 'axis-x': 'red (X)', 'axis-z': 'blue (Z)', 'axis-y': 'green (vertical)' };
        this.ui.setHint(lock
          ? `Direction locked to the ${names[lock.kind]} axis — press the arrow again or Esc to release.`
          : 'Axis lock released.');
        return;
      }
      if (ev.key === 'h' || ev.key === '?' || ev.key === 'F1') {
        ev.preventDefault();
        showHelpDialog(this);
        return;
      }

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
          this.model.batch(() => {
            for (const id of [...this.selection]) this.model.remove(id);
          });
          this.select(null);
        }
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'g') {
        ev.preventDefault();
        ev.shiftKey ? this.ungroupSelection() : this.groupSelection();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a') {
        ev.preventDefault();
        this.select(null);
        for (const [id, obj] of this.model.objects) {
          if (obj.visible) this.select(id, { additive: true });
        }
        this.ui.setHint(`${this.selection.size} objects selected.`);
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
          this.model.batch(() => {
            const gidMap = new Map();
            for (const json of this.clipboard) {
              const copy = JSON.parse(json);
              delete copy.id;
              if (copy.groupId) {
                if (!gidMap.has(copy.groupId)) {
                  gidMap.set(copy.groupId, `grp${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)}`);
                }
                copy.groupId = gidMap.get(copy.groupId);
              }
              const adder = copy.type === 'dimension' ? 'addDimension'
                : copy.type === 'label' ? 'addLabel'
                : copy.type === 'profile' ? 'addProfile' : 'addSolid';
              const added = this.model[adder](copy);
              translateEntity(added, new THREE.Vector3(12, 0, 12));
              this.model.update(added);
              this.select(added.id, { additive: true });
            }
          });
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
        if (text && !this.handleCommand(text)) this.activeTool?.onVCB(text);
        vcb.value = '';
        if (!TOOL_COMMANDS[text.toLowerCase()]) vcb.blur();
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
      localStorage.removeItem('cadshop-autosave');
    });
    $('#btn-settings').addEventListener('click', () => showSettingsDialog());
    $('#btn-help').addEventListener('click', () => showHelpDialog(this));
    $('#display-style').value = Settings.displayStyle;
    $('#display-style').addEventListener('change', (ev) => {
      Settings.displayStyle = ev.target.value;
      saveSettings();
      this.applyDisplayStyle();
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

// exposed for debugging and scripted testing
window.cadshop = new App();
