import { Units } from '../core/units.js';
import { profileCorners } from '../core/model.js';

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

export function renderEntityInfo(el, model, id) {
  if (!id || !model.entities.get(id)) {
    el.innerHTML = '<div class="muted">Nothing selected</div>';
    return;
  }
  const e = model.entities.get(id);
  const layer = model.layer(e.layerId);
  const rows = [];
  const row = (k, v) => rows.push(`<div>${k}: <b>${v}</b></div>`);

  if (e.type === 'solid' || e.type === 'profile') {
    row('Type', e.type === 'solid' ? 'Solid' : 'Shape');
    if (e.kind === 'circle') {
      row('Radius', Units.format(e.radius));
    } else {
      const pts = profileCorners(e);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      }
      row('Size', `${Units.format(maxX - minX)} × ${Units.format(maxY - minY)}`);
    }
    if (e.type === 'solid') row('Depth', Units.format(Math.abs(e.depth)));
    // area of the base
    let area;
    if (e.kind === 'circle') area = Math.PI * e.radius * e.radius;
    else {
      const pts = profileCorners(e);
      area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        area += a.x * b.y - b.x * a.y;
      }
      area = Math.abs(area) / 2;
    }
    row('Base area', Units.formatArea(area));
    if (e.type === 'solid') {
      row('Volume', `${(area * Math.abs(e.depth) / 1728).toFixed(2)} cu ft`);
    }
  } else if (e.type === 'dimension') {
    row('Type', 'Dimension');
    row('Length', e.label);
  }
  row('Layer', layer.name);
  el.innerHTML = rows.join('');
}
