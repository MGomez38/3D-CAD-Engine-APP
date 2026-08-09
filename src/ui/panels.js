import { Units } from '../core/units.js';
import { profileCorners, computeArea } from '../core/model.js';
import { MATERIALS, materialById } from '../lib/materials.js';
import { buildCutList, cutListCSV } from '../lib/cutlist.js';

const LAYER_COLORS = ['#8fb8d8', '#d8a98f', '#9fd88f', '#d88fbe', '#d8d08f', '#8f93d8', '#7fc8c0'];

export function buildLayersPanel(listEl, addBtn, model, history) {
  function render() {
    listEl.innerHTML = '';
    for (const layer of model.layers) {
      const row = document.createElement('div');
      row.className = 'layer-row' + (layer.id === model.activeLayerId ? ' active' : '');

      const swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = layer.color;
      swatch.title = 'Click to change color';
      swatch.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = layer.color;
        picker.addEventListener('input', () => {
          layer.color = picker.value;
          for (const e of model.entities.values()) {
            if (e.layerId === layer.id) model.rebuildObject(e);
          }
          model.changed();
        });
        picker.click();
      });

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = layer.name;
      name.title = 'Double-click to rename';
      name.addEventListener('dblclick', () => {
        const n = prompt('Layer name', layer.name);
        if (n) { layer.name = n; model.changed(); }
      });

      const vis = document.createElement('button');
      vis.className = 'vis';
      vis.textContent = layer.visible ? '👁' : '–';
      vis.title = 'Toggle visibility';
      vis.addEventListener('click', (ev) => {
        ev.stopPropagation();
        model.setLayerVisible(layer.id, !layer.visible);
      });

      row.append(swatch, name, vis);
      row.addEventListener('click', () => {
        model.activeLayerId = layer.id;
        model.changed();
      });
      listEl.appendChild(row);
    }
  }

  addBtn.addEventListener('click', () => {
    history.checkpoint();
    const color = LAYER_COLORS[model.layers.length % LAYER_COLORS.length];
    const id = model.addLayer(`Layer ${model.layers.length}`, color);
    model.activeLayerId = id;
    model.changed();
  });

  return { render };
}

// ---------------------------------------------------------------------------
// Saved views (scenes): snapshot camera angles, restore with one click.

export function buildScenesPanel(listEl, addBtn, model, viewport) {
  function render() {
    listEl.innerHTML = '';
    if (!model.scenes.length) {
      listEl.innerHTML = '<div class="muted">None yet — set up a view and save it</div>';
      return;
    }
    for (const scene of model.scenes) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = scene.name;
      name.title = 'Click to restore · double-click to rename';
      name.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        const n = prompt('View name', scene.name);
        if (n) { scene.name = n; model.changed(); }
      });
      const del = document.createElement('button');
      del.className = 'vis';
      del.textContent = '×';
      del.title = 'Delete this view';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        model.scenes = model.scenes.filter(s => s.id !== scene.id);
        model.changed();
      });
      row.append(name, del);
      row.addEventListener('click', () => {
        viewport.camera.position.set(...scene.position);
        viewport.controls.target.set(...scene.target);
        viewport.controls.update();
      });
      listEl.appendChild(row);
    }
  }

  addBtn.addEventListener('click', () => {
    model.scenes.push({
      id: `sc${Date.now().toString(36)}`,
      name: `View ${model.scenes.length + 1}`,
      position: viewport.camera.position.toArray(),
      target: viewport.controls.target.toArray(),
    });
    model.changed();
  });

  return { render };
}

// ---------------------------------------------------------------------------
// Entity info — editable name & material for solids, weight readout,
// summary for multi-selections.

export function renderEntityInfo(el, model, selection, { onEdit } = {}) {
  const ids = [...(selection || [])].filter(id => model.entities.get(id));
  if (!ids.length) {
    el.innerHTML = '<div class="muted">Nothing selected</div>';
    return;
  }

  if (ids.length > 1) {
    let weight = 0, solids = 0;
    const gids = new Set(ids.map(id => model.entities.get(id).groupId ?? null));
    for (const id of ids) {
      const e = model.entities.get(id);
      if (e.type === 'solid') {
        solids++;
        weight += computeArea(e) * Math.abs(e.depth) * materialById(e.material).density;
      }
    }
    const isGroup = gids.size === 1 && !gids.has(null);
    el.innerHTML =
      `<div><b>${ids.length}</b> objects selected${isGroup ? ' <b>(group)</b>' : ''}</div>` +
      (solids ? `<div>Total weight: <b>${weight.toFixed(1)} lb</b></div>` : '') +
      (isGroup
        ? '<div class="muted">Ctrl+Shift+G ungroups</div>'
        : '<div class="muted">Ctrl+G groups them into one object</div>');
    return;
  }

  const e = model.entities.get(ids[0]);
  const layer = model.layer(e.layerId);
  const rows = [];
  const row = (k, v) => rows.push(`<div>${k}: <b>${v}</b></div>`);

  if (e.type === 'solid' || e.type === 'profile') {
    row('Type', e.type === 'solid' ? (e.spec || 'Solid') : 'Shape');
    if (e.kind === 'circle') {
      row('Diameter', Units.format(e.radius * 2));
      if (e.innerRadius > 0) row('Wall', Units.format(e.radius - e.innerRadius));
    } else {
      const pts = profileCorners(e);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      row('Size', `${Units.format(maxX - minX)} × ${Units.format(maxY - minY)}`);
    }
    if (e.type === 'solid') row('Length', Units.format(Math.abs(e.depth)));
    const area = computeArea(e);
    row('Section area', `${area.toFixed(2)} sq in`);
    if (e.type === 'solid') {
      const mat = materialById(e.material);
      if (mat.density > 0) {
        row('Weight', `${(area * Math.abs(e.depth) * mat.density).toFixed(1)} lb`);
      } else {
        row('Volume', `${(area * Math.abs(e.depth) / 1728).toFixed(2)} cu ft`);
      }
    }
  } else if (e.type === 'dimension') {
    row('Type', 'Dimension');
    row('Length', e.label);
  } else if (e.type === 'label') {
    row('Type', 'Note');
  } else if (e.type === 'edge') {
    row('Type', 'Line');
    let len = 0;
    for (let i = 1; i < e.points.length; i++) {
      const a = e.points[i - 1], b = e.points[i];
      len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    row('Length', Units.format(len));
    row('Segments', String(e.points.length - 1));
  }
  el.innerHTML = rows.join('');

  if (e.type === 'label') {
    const lbl = document.createElement('label');
    lbl.textContent = 'Text ';
    const input = document.createElement('input');
    input.value = e.text || '';
    input.addEventListener('change', () => onEdit?.(e.id, { text: input.value }));
    input.addEventListener('keydown', ev => ev.stopPropagation());
    lbl.appendChild(input);
    el.appendChild(lbl);
  }

  // ---- parametric edits (Fusion-style: change dimensions after the fact) ----
  const addField = (labelText, value, apply) => {
    const label = document.createElement('label');
    label.textContent = labelText + ' ';
    const input = document.createElement('input');
    input.value = value;
    input.addEventListener('change', () => {
      const v = Units.parse(input.value);
      if (v == null || v <= 0) return;
      apply(v);
    });
    input.addEventListener('keydown', ev => ev.stopPropagation());
    label.appendChild(input);
    el.appendChild(label);
  };

  if (e.type === 'solid' || e.type === 'profile') {
    if (e.kind === 'circle') {
      addField('Radius', Units.format(e.radius), (r) => {
        const patch = { radius: r };
        if (e.innerRadius > 0) {
          patch.innerRadius = Math.max(r - (e.radius - e.innerRadius), 0.01);
        }
        onEdit?.(e.id, patch);
      });
    } else if (isAxisRect(e.points)) {
      const { minX, maxX, minY, maxY } = bbox2(e.points);
      addField('Width', Units.format(maxX - minX), (w) =>
        onEdit?.(e.id, scaleRect(e.points, e.holes, w, null)));
      addField('Height', Units.format(maxY - minY), (h) =>
        onEdit?.(e.id, scaleRect(e.points, e.holes, null, h)));
    }
    if (e.type === 'solid') {
      addField(e.noBom ? 'Thickness' : 'Length', Units.format(Math.abs(e.depth)), (len) =>
        onEdit?.(e.id, { depth: (e.depth < 0 ? -1 : 1) * len }));
    }
  }

  // editable part name + material for solids
  if (e.type === 'solid') {
    const nameLabel = document.createElement('label');
    nameLabel.innerHTML = 'Part name ';
    const nameInput = document.createElement('input');
    nameInput.value = e.name || '';
    nameInput.placeholder = e.spec || 'e.g. Top rail';
    nameInput.addEventListener('change', () => onEdit?.(e.id, { name: nameInput.value.trim() }));
    nameInput.addEventListener('keydown', ev => ev.stopPropagation());
    nameLabel.appendChild(nameInput);
    el.appendChild(nameLabel);

    const matLabel = document.createElement('label');
    matLabel.innerHTML = 'Material ';
    const matSel = document.createElement('select');
    for (const m of MATERIALS) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.name;
      matSel.appendChild(o);
    }
    matSel.value = e.material || 'generic';
    matSel.addEventListener('change', () => onEdit?.(e.id, { material: matSel.value }));
    matLabel.appendChild(matSel);
    el.appendChild(matLabel);
  }

  // layer reassignment for any entity
  const layerLabel = document.createElement('label');
  layerLabel.innerHTML = 'Layer ';
  const layerSel = document.createElement('select');
  for (const l of model.layers) {
    const o = document.createElement('option');
    o.value = l.id; o.textContent = l.name;
    layerSel.appendChild(o);
  }
  layerSel.value = e.layerId;
  layerSel.addEventListener('change', () => onEdit?.(e.id, { layerId: layerSel.value }));
  layerLabel.appendChild(layerSel);
  el.appendChild(layerLabel);
}

function bbox2(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

function isAxisRect(points) {
  if (!points || points.length !== 4) return false;
  const xs = new Set(points.map(p => Math.round(p[0] * 64)));
  const ys = new Set(points.map(p => Math.round(p[1] * 64)));
  return xs.size === 2 && ys.size === 2;
}

/**
 * Resize a rectangle to a new width/height about its min corner. Holes
 * (door/window openings) keep their own size — only their centers shift
 * proportionally so they stay inside the resized face.
 */
function scaleRect(points, holes, newW, newH) {
  const { minX, maxX, minY, maxY } = bbox2(points);
  const sx = newW != null ? newW / (maxX - minX) : 1;
  const sy = newH != null ? newH / (maxY - minY) : 1;
  const outer = points.map(([x, y]) => [minX + (x - minX) * sx, minY + (y - minY) * sy]);
  const movedHoles = (holes || []).map(hole => {
    const hb = bbox2(hole);
    const cx = (hb.minX + hb.maxX) / 2, cy = (hb.minY + hb.maxY) / 2;
    const dx = (minX + (cx - minX) * sx) - cx;
    const dy = hole.some(([, y]) => Math.abs(y - minY) < 0.01)
      ? 0 // doors stay on the floor
      : (minY + (cy - minY) * sy) - cy;
    return hole.map(([x, y]) => [x + dx, y + dy]);
  });
  return { points: outer, holes: movedHoles };
}

// ---------------------------------------------------------------------------
// Component library panel

import { listComponents, deleteComponent } from '../lib/components.js';

export function buildComponentsPanel(listEl, saveBtn, app) {
  function render() {
    const comps = listComponents();
    listEl.innerHTML = '';
    if (!comps.length) {
      listEl.innerHTML = '<div class="muted">Select objects, then save them as a reusable part</div>';
      return;
    }
    for (const c of comps) {
      const row = document.createElement('div');
      row.className = 'layer-row';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${c.name} (${c.entities.length})`;
      name.title = 'Click to place into the model';
      const del = document.createElement('button');
      del.className = 'vis';
      del.textContent = '×';
      del.title = 'Delete from library';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (confirm(`Delete component "${c.name}" from your library?`)) {
          deleteComponent(c.id);
          render();
        }
      });
      row.append(name, del);
      row.addEventListener('click', () => app.placeComponent(c));
      listEl.appendChild(row);
    }
  }

  saveBtn.addEventListener('click', () => app.saveSelectionAsComponent());
  return { render };
}

// ---------------------------------------------------------------------------
// Cut list panel

export function buildCutListPanel(el, csvBtn, model) {
  function render() {
    const { rows, totalWeight } = buildCutList(model);
    if (!rows.length) {
      el.innerHTML = '<div class="muted">No parts yet</div>';
      return;
    }
    const cells = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.desc)}</td>
        <td class="num">${Units.format(r.length)}</td>
        <td class="num">${r.qty}</td>
        <td class="num">${r.totalWeight > 0 ? r.totalWeight.toFixed(1) : '—'}</td>
      </tr>`).join('');
    el.innerHTML = `
      <table class="cutlist">
        <thead><tr><th>Item</th><th>Length</th><th>Qty</th><th>lb</th></tr></thead>
        <tbody>${cells}</tbody>
        <tfoot><tr><td colspan="3">Total weight</td><td class="num">${totalWeight.toFixed(1)}</td></tr></tfoot>
      </table>`;
  }

  csvBtn.addEventListener('click', () => {
    const csv = cutListCSV(buildCutList(model));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'cutlist.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });

  return { render };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
