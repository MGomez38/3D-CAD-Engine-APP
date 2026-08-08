import { profileCorners } from '../core/model.js';

// Minimal DXF (AutoCAD 2000 / AC1015) writer.
//
// Exports every visible solid/profile as its FLAT cross-section outline —
// exactly what a plasma / laser / waterjet table wants. Parts are laid out
// side by side with a 2" gap, in inches.

export function modelToDXF(model) {
  const chunks = [];
  const push = (...pairs) => {
    for (const [code, val] of pairs) chunks.push(String(code), String(val));
  };

  // header: units = inches
  push([0, 'SECTION'], [2, 'HEADER'],
    [9, '$ACADVER'], [1, 'AC1015'],
    [9, '$INSUNITS'], [70, 1],
    [0, 'ENDSEC']);
  push([0, 'SECTION'], [2, 'ENTITIES']);

  let cursorX = 0;
  let exported = 0;

  for (const e of model.entities.values()) {
    if (e.type !== 'solid' && e.type !== 'profile') continue;
    if (!model.layer(e.layerId).visible) continue;
    const layerName = sanitize(model.layer(e.layerId).name);

    if (e.kind === 'circle') {
      const r = e.radius;
      const cx = cursorX + r, cy = r;
      circle(push, layerName, cx, cy, r);
      if (e.innerRadius > 0) circle(push, layerName, cx, cy, e.innerRadius);
      cursorX += r * 2 + 2;
    } else {
      // shift the outline so its bbox starts at (cursorX, 0)
      const pts = e.points;
      let minX = Infinity, minY = Infinity, maxX = -Infinity;
      for (const [x, y] of pts) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x);
      }
      const dx = cursorX - minX, dy = -minY;
      polyline(push, layerName, pts.map(([x, y]) => [x + dx, y + dy]));
      for (const hole of e.holes || []) {
        polyline(push, layerName, hole.map(([x, y]) => [x + dx, y + dy]));
      }
      cursorX += (maxX - minX) + 2;
    }
    exported++;
  }

  push([0, 'ENDSEC'], [0, 'EOF']);
  return { text: chunks.join('\n') + '\n', count: exported };
}

function polyline(push, layer, pts) {
  push([0, 'LWPOLYLINE'], [8, layer], [90, pts.length], [70, 1]); // 70=1 closed
  for (const [x, y] of pts) push([10, num(x)], [20, num(y)]);
}

function circle(push, layer, x, y, r) {
  push([0, 'CIRCLE'], [8, layer], [10, num(x)], [20, num(y)], [40, num(r)]);
}

const num = v => Number(v.toFixed(6));
const sanitize = s => (s || 'LAYER').replace(/[^A-Za-z0-9_-]/g, '_').toUpperCase();

// re-export kept for future use (e.g., exporting projected views)
export { profileCorners };
