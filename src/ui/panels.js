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
    for (const id of ids) {
      const e = model.entities.get(id);
      if (e.type === 'solid') {
        solids++;
        weight += computeArea(e) * Math.abs(e.depth) * materialById(e.material).density;
      }
    }
    el.innerHTML =
      `<div><b>${ids.length}</b> objects selected</div>` +
      (solids ? `<div>Total weight: <b>${weight.toFixed(1)} lb</b></div>` : '') +
      '<div class="muted">Move/Rotate act on the whole selection</div>';
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
  }
  row('Layer', layer.name);
  el.innerHTML = rows.join('');

  // editable part name + material for solids
  if (e.type === 'solid') {
    const nameLabel = document.createElement('label');
    nameLabel.innerHTML = 'Part name ';
    const nameInput = document.createElement('input');
    nameInput.value = e.name || '';
    nameInput.placeholder = e.spec || 'e.g. Top rail';
    nameInput.addEventListener('change', () => onEdit?.(e.id, { name: nameInput.value.trim() }));
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
