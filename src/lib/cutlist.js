import { computeArea } from '../core/model.js';
import { materialById } from './materials.js';
import { Units } from '../core/units.js';

// Cut list / bill of materials: groups solids by description, material,
// and cut length. Weights come from cross-section area × length × density.

export function buildCutList(model) {
  const rows = new Map();
  let totalWeight = 0;

  for (const e of model.entities.values()) {
    if (e.type !== 'solid') continue;
    if (!model.layer(e.layerId).visible) continue;
    const mat = materialById(e.material);
    const length = Math.abs(e.depth);
    const lengthKey = Math.round(length * 16); // group to 1/16"
    const desc = e.name || e.spec || describeGeneric(e);
    const weight = computeArea(e) * length * mat.density;
    totalWeight += weight;

    const key = `${desc}|${e.spec || ''}|${mat.id}|${lengthKey}`;
    const row = rows.get(key);
    if (row) {
      row.qty += 1;
      row.totalWeight += weight;
    } else {
      rows.set(key, {
        desc, spec: e.spec || '', material: mat, length,
        qty: 1, weightEach: weight, totalWeight: weight,
      });
    }
  }

  const list = [...rows.values()].sort((a, b) => a.desc.localeCompare(b.desc) || a.length - b.length);
  return { rows: list, totalWeight };
}

function describeGeneric(e) {
  if (e.kind === 'circle') {
    return e.innerRadius > 0
      ? `Tube ${(e.radius * 2).toFixed(2)} OD`
      : `Round ${(e.radius * 2).toFixed(2)} Ø`;
  }
  return 'Custom shape';
}

export function cutListCSV({ rows, totalWeight }) {
  const esc = s => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ['Item,Spec,Material,Cut Length,Qty,Weight Each (lb),Total Weight (lb)'];
  for (const r of rows) {
    lines.push([
      esc(r.desc), esc(r.spec), esc(r.material.name), esc(Units.format(r.length)),
      r.qty, r.weightEach.toFixed(1), r.totalWeight.toFixed(1),
    ].join(','));
  }
  lines.push(`,,,,,Total:,${totalWeight.toFixed(1)}`);
  return lines.join('\n');
}
