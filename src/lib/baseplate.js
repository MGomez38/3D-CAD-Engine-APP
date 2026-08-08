// Baseplate generator: rectangular plate with bolt holes, centered on origin.
// Holes are 20-gon loops (reversed winding) so they extrude, area-subtract,
// and DXF-export correctly.

export function baseplateProfile({ w, h, holeD, edge, holeCount = 4 }) {
  const points = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const holes = [];
  if (holeCount > 0 && holeD > 0) {
    const r = holeD / 2;
    const cx = w / 2 - edge, cy = h / 2 - edge;
    const centers = holeCount === 2
      ? [[-cx, 0], [cx, 0]]
      : [[-cx, -cy], [cx, -cy], [cx, cy], [-cx, cy]];
    for (const [hx, hy] of centers) holes.push(circleLoop(hx, hy, r));
  }
  return { kind: 'poly', points, holes };
}

function circleLoop(cx, cy, r, segs = 20) {
  const pts = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts.reverse(); // hole winding
}

/** Entry for the Steel library (PROFILE_CATEGORIES shape). Extrude depth = plate thickness. */
export const BASEPLATE_CATEGORY = {
  id: 'baseplate', name: 'Baseplate (bolt holes)',
  params: [
    { key: 'w', label: 'Width', def: 6 },
    { key: 'h', label: 'Depth', def: 6 },
    { key: 'holeD', label: 'Hole Ø', def: 0.5625 },
    { key: 'edge', label: 'Hole edge dist', def: 1 },
  ],
  make: p => baseplateProfile({ ...p, holeCount: 4 }),
  spec: p => `BP ${trim(p.w)}x${trim(p.h)}`,
  sizes: [
    { label: 'BP 4x4, 5/16" holes', w: 4, h: 4, holeD: 0.3125, edge: 0.75 },
    { label: 'BP 6x6, 7/16" holes', w: 6, h: 6, holeD: 0.4375, edge: 1 },
    { label: 'BP 8x8, 9/16" holes', w: 8, h: 8, holeD: 0.5625, edge: 1.25 },
    { label: 'BP 10x10, 11/16" holes', w: 10, h: 10, holeD: 0.6875, edge: 1.5 },
  ],
};

const trim = v => String(Math.round(v * 100) / 100);
