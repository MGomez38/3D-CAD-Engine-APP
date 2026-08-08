// Parametric structural / stock profile library. All dimensions in inches.
// Each category produces a profile description consumable by the model:
//   { kind:'poly', points:[[x,y],...], holes:[[[x,y],...]] }  or
//   { kind:'circle', radius, innerRadius }
// Profiles are centered on their bounding box so members place predictably.

function centerPts(outer, holes = []) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outer) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const shift = pts => pts.map(([x, y]) => [x - cx, y - cy]);
  return { points: shift(outer), holes: holes.map(shift) };
}

const rev = pts => [...pts].reverse();

function anglePoints({ a, b, t }) {
  return centerPts([[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]]);
}

function channelPoints({ d, bf, tf, tw }) {
  // channel opens to the right (web on the left)
  return centerPts([
    [0, 0], [bf, 0], [bf, tf], [tw, tf], [tw, d - tf], [bf, d - tf], [bf, d], [0, d],
  ]);
}

function beamPoints({ d, bf, tf, tw }) {
  const cx = bf / 2;
  return centerPts([
    [0, 0], [bf, 0], [bf, tf], [cx + tw / 2, tf], [cx + tw / 2, d - tf],
    [bf, d - tf], [bf, d], [0, d], [0, d - tf], [cx - tw / 2, d - tf],
    [cx - tw / 2, tf], [0, tf],
  ]);
}

function rectTubePoints({ w, h, t }) {
  const outer = [[0, 0], [w, 0], [w, h], [0, h]];
  const hole = [[t, t], [w - t, t], [w - t, h - t], [t, h - t]];
  return centerPts(outer, [rev(hole)]);
}

function rectPoints({ w, h }) {
  return centerPts([[0, 0], [w, 0], [w, h], [0, h]]);
}

import { BASEPLATE_CATEGORY } from './baseplate.js';

export const PROFILE_CATEGORIES = [
  {
    id: 'angle', name: 'Angle (L)',
    params: [
      { key: 'a', label: 'Leg A', def: 2 },
      { key: 'b', label: 'Leg B', def: 2 },
      { key: 't', label: 'Thickness', def: 0.25 },
    ],
    make: p => ({ kind: 'poly', ...anglePoints(p) }),
    spec: p => `L ${fr(p.a)}x${fr(p.b)}x${fr(p.t)}`,
    sizes: [
      { label: 'L 1x1x1/8', a: 1, b: 1, t: 0.125 },
      { label: 'L 1-1/2x1-1/2x3/16', a: 1.5, b: 1.5, t: 0.1875 },
      { label: 'L 2x2x1/8', a: 2, b: 2, t: 0.125 },
      { label: 'L 2x2x1/4', a: 2, b: 2, t: 0.25 },
      { label: 'L 2-1/2x2-1/2x1/4', a: 2.5, b: 2.5, t: 0.25 },
      { label: 'L 3x3x1/4', a: 3, b: 3, t: 0.25 },
      { label: 'L 3x3x3/8', a: 3, b: 3, t: 0.375 },
      { label: 'L 4x4x1/4', a: 4, b: 4, t: 0.25 },
      { label: 'L 4x4x3/8', a: 4, b: 4, t: 0.375 },
      { label: 'L 3x2x1/4', a: 3, b: 2, t: 0.25 },
      { label: 'L 4x3x1/4', a: 4, b: 3, t: 0.25 },
    ],
  },
  {
    id: 'tube', name: 'Square / Rect Tube (HSS)',
    params: [
      { key: 'w', label: 'Width', def: 2 },
      { key: 'h', label: 'Height', def: 2 },
      { key: 't', label: 'Wall', def: 0.125 },
    ],
    make: p => ({ kind: 'poly', ...rectTubePoints(p) }),
    spec: p => `HSS ${fr(p.w)}x${fr(p.h)}x${fr(p.t)}`,
    sizes: [
      { label: 'HSS 1x1x1/8', w: 1, h: 1, t: 0.125 },
      { label: 'HSS 1-1/2x1-1/2x1/8', w: 1.5, h: 1.5, t: 0.125 },
      { label: 'HSS 2x2x1/8', w: 2, h: 2, t: 0.125 },
      { label: 'HSS 2x2x1/4', w: 2, h: 2, t: 0.25 },
      { label: 'HSS 3x3x3/16', w: 3, h: 3, t: 0.1875 },
      { label: 'HSS 4x4x1/4', w: 4, h: 4, t: 0.25 },
      { label: 'HSS 6x6x3/8', w: 6, h: 6, t: 0.375 },
      { label: 'HSS 2x1x1/8', w: 2, h: 1, t: 0.125 },
      { label: 'HSS 3x2x3/16', w: 3, h: 2, t: 0.1875 },
      { label: 'HSS 4x2x1/4', w: 4, h: 2, t: 0.25 },
      { label: 'HSS 6x2x1/4', w: 6, h: 2, t: 0.25 },
      { label: 'HSS 8x4x3/8', w: 8, h: 4, t: 0.375 },
    ],
  },
  {
    id: 'channel', name: 'Channel (C)',
    params: [
      { key: 'd', label: 'Depth', def: 4 },
      { key: 'bf', label: 'Flange', def: 1.584 },
      { key: 'tf', label: 'Flange thk', def: 0.296 },
      { key: 'tw', label: 'Web thk', def: 0.184 },
    ],
    make: p => ({ kind: 'poly', ...channelPoints(p) }),
    spec: p => `C ${fr(p.d)}x${fr(p.bf)}`,
    sizes: [
      { label: 'C3x4.1', d: 3, bf: 1.41, tf: 0.273, tw: 0.17 },
      { label: 'C4x5.4', d: 4, bf: 1.584, tf: 0.296, tw: 0.184 },
      { label: 'C5x6.7', d: 5, bf: 1.75, tf: 0.32, tw: 0.19 },
      { label: 'C6x8.2', d: 6, bf: 1.92, tf: 0.343, tw: 0.2 },
      { label: 'C8x11.5', d: 8, bf: 2.26, tf: 0.39, tw: 0.22 },
      { label: 'C10x15.3', d: 10, bf: 2.6, tf: 0.436, tw: 0.24 },
    ],
  },
  {
    id: 'beam', name: 'Wide Flange (W)',
    params: [
      { key: 'd', label: 'Depth', def: 6 },
      { key: 'bf', label: 'Flange', def: 4 },
      { key: 'tf', label: 'Flange thk', def: 0.28 },
      { key: 'tw', label: 'Web thk', def: 0.23 },
    ],
    make: p => ({ kind: 'poly', ...beamPoints(p) }),
    spec: p => `W ${fr(p.d)}x${fr(p.bf)}`,
    sizes: [
      { label: 'W4x13', d: 4.16, bf: 4.06, tf: 0.345, tw: 0.28 },
      { label: 'W6x9', d: 5.9, bf: 3.94, tf: 0.215, tw: 0.17 },
      { label: 'W6x15', d: 5.99, bf: 5.99, tf: 0.26, tw: 0.23 },
      { label: 'W8x18', d: 8.14, bf: 5.25, tf: 0.33, tw: 0.23 },
      { label: 'W8x31', d: 8.0, bf: 8.0, tf: 0.435, tw: 0.285 },
      { label: 'W10x22', d: 10.17, bf: 5.75, tf: 0.36, tw: 0.24 },
      { label: 'W12x26', d: 12.22, bf: 6.49, tf: 0.38, tw: 0.23 },
    ],
  },
  {
    id: 'pipe', name: 'Pipe / Round Tube',
    params: [
      { key: 'od', label: 'Outside Ø', def: 1.9 },
      { key: 't', label: 'Wall', def: 0.145 },
    ],
    make: p => ({ kind: 'circle', radius: p.od / 2, innerRadius: Math.max(p.od / 2 - p.t, 0.01), center: [0, 0] }),
    spec: p => `Pipe ${fr(p.od)} OD x ${fr(p.t)}`,
    sizes: [
      { label: 'Pipe 3/4 Sch40 (1.05 OD)', od: 1.05, t: 0.113 },
      { label: 'Pipe 1 Sch40 (1.315 OD)', od: 1.315, t: 0.133 },
      { label: 'Pipe 1-1/4 Sch40 (1.66 OD)', od: 1.66, t: 0.14 },
      { label: 'Pipe 1-1/2 Sch40 (1.9 OD)', od: 1.9, t: 0.145 },
      { label: 'Pipe 2 Sch40 (2.375 OD)', od: 2.375, t: 0.154 },
      { label: 'Tube 1 OD x .065', od: 1, t: 0.065 },
      { label: 'Tube 1-1/2 OD x .083', od: 1.5, t: 0.083 },
      { label: 'Tube 2 OD x .120', od: 2, t: 0.12 },
    ],
  },
  {
    id: 'flatbar', name: 'Flat Bar',
    params: [
      { key: 'w', label: 'Width', def: 2 },
      { key: 'h', label: 'Thickness', def: 0.25 },
    ],
    make: p => ({ kind: 'poly', ...rectPoints(p) }),
    spec: p => `FB ${fr(p.w)}x${fr(p.h)}`,
    sizes: [
      { label: 'FB 1x1/8', w: 1, h: 0.125 },
      { label: 'FB 1x1/4', w: 1, h: 0.25 },
      { label: 'FB 1-1/2x1/4', w: 1.5, h: 0.25 },
      { label: 'FB 2x1/4', w: 2, h: 0.25 },
      { label: 'FB 2x3/8', w: 2, h: 0.375 },
      { label: 'FB 3x1/4', w: 3, h: 0.25 },
      { label: 'FB 3x3/8', w: 3, h: 0.375 },
      { label: 'FB 4x1/4', w: 4, h: 0.25 },
      { label: 'FB 4x1/2', w: 4, h: 0.5 },
    ],
  },
  {
    id: 'roundbar', name: 'Round Bar',
    params: [{ key: 'od', label: 'Diameter', def: 0.75 }],
    make: p => ({ kind: 'circle', radius: p.od / 2, center: [0, 0] }),
    spec: p => `RB ${fr(p.od)} Ø`,
    sizes: [
      { label: 'RB 1/4', od: 0.25 }, { label: 'RB 3/8', od: 0.375 },
      { label: 'RB 1/2', od: 0.5 }, { label: 'RB 5/8', od: 0.625 },
      { label: 'RB 3/4', od: 0.75 }, { label: 'RB 1', od: 1 },
      { label: 'RB 1-1/4', od: 1.25 }, { label: 'RB 1-1/2', od: 1.5 },
      { label: 'RB 2', od: 2 },
    ],
  },
  {
    id: 'plate', name: 'Plate / Sheet',
    params: [
      { key: 'w', label: 'Width', def: 12 },
      { key: 'h', label: 'Height', def: 12 },
    ],
    make: p => ({ kind: 'poly', ...rectPoints(p) }),
    spec: p => `PL ${fr(p.w)}x${fr(p.h)}`,
    sizes: [
      { label: 'PL 12x12', w: 12, h: 12 },
      { label: 'PL 6x6', w: 6, h: 6 },
      { label: 'PL 4x4', w: 4, h: 4 },
      { label: 'PL 24x24', w: 24, h: 24 },
    ],
  },
];

PROFILE_CATEGORIES.push(BASEPLATE_CATEGORY);

/** 0.25 -> "1/4", 1.5 -> "1-1/2", 2 -> "2" — spec-style fraction printing. */
function fr(v) {
  const whole = Math.floor(v + 1e-9);
  const frac = v - whole;
  const sixteenths = Math.round(frac * 16);
  if (sixteenths === 0) return String(whole);
  if (sixteenths === 16) return String(whole + 1);
  let n = sixteenths, d = 16;
  while (n % 2 === 0) { n /= 2; d /= 2; }
  const f = `${n}/${d}`;
  return whole > 0 ? `${whole}-${f}` : f;
}

export function categoryById(id) {
  return PROFILE_CATEGORIES.find(c => c.id === id);
}
