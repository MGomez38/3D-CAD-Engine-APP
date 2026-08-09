import { baseplateProfile } from './baseplate.js';

// ---------------------------------------------------------------------------
// Parametric railing engine — the heart of the guardrail/handrail designer.
//
// Given a ground path (level, straight segments) and a configuration, this
// generates every member of a complete railing run as plain solid entities:
// posts (auto-spaced), a top rail per segment, mid-rails or code-compliant
// pickets, and bolt-hole baseplates under each post.
//
// Pure geometry — no three.js, no DOM — so it is directly unit-testable.
// All lengths are inches. Ground is the XZ plane, Y is up.
// ---------------------------------------------------------------------------

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross3 = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * @param path   [{x,z}, ...] 2+ ground points (plan view, straight segments)
 * @param cfg    {
 *   system: 'guardrail'|'handrail', height, postSpacingMax,
 *   runType: 'level'|'stairs', stairAngle: 32,   // stairs: rail slopes, posts stay vertical
 *   post:    { profile, spec, size:{w,h} },
 *   topRail: { profile, spec, size:{w,h} },
 *   infill:  { type:'none'|'midrails'|'pickets', count, picket:{profile,spec,size}, maxClear },
 *   baseplate: null | { w,h,t,holeD,edge,holeCount,spec },
 *   material: 'steel',
 * }
 * @returns { entities:[solidDesc...], warnings:[string...] }
 *
 * Stairs: the whole path is one flight rising at stairAngle. Post bases follow
 * the slope (they mount on the treads/stringer), rails run parallel to it, and
 * the rail height is measured vertically — matching how codes measure it.
 */
export function generateRailing(path, cfg) {
  const warnings = codeCheck(cfg);
  const entities = [];

  const slope = cfg.runType === 'stairs'
    ? Math.tan(((cfg.stairAngle ?? 32) * Math.PI) / 180)
    : 0;
  const plateT = cfg.baseplate ? cfg.baseplate.t : 0;
  const railH = cfg.topRail.size.h;
  const postTop = cfg.height - railH;  // underside of the top rail (vertical)
  const y0 = plateT;                   // top of baseplate = bottom of post
  const postLen = postTop - y0;        // constant, even on stairs
  if (postLen <= 0) {
    warnings.push('Railing height is too small for the chosen top rail.');
    return { entities, warnings };
  }

  const solid = (profile, plane, depth, name, spec) => ({
    type: 'solid', ...profile, plane, depth,
    name, spec, material: cfg.material, transform: null,
  });
  const groundPlane = (x, y, z) => ({ origin: [x, y, z], u: [1, 0, 0], v: [0, 0, -1] });
  /** Plane for a member running along plan direction d at the flight slope. */
  const slopedPlane = (x, y, z, d) => {
    const dir3 = norm3([d.x, slope, d.z]);
    const u = [d.z, 0, -d.x];
    return { origin: [x, y, z], u, v: norm3(cross3(dir3, u)) };
  };
  const runScale = Math.hypot(1, slope); // member length per unit of plan length

  // ---- segments and post layout (s = cumulative plan distance) ------------
  const segs = [];
  const posts = []; // {x,z,s}
  const bays = [];  // {a:{x,z}, d, len, s0}
  let sAcc = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const d = { x: dx / L, z: dz / L };
    segs.push({ a, d, L, s0: sAcc });

    const nBays = Math.max(1, Math.ceil(L / cfg.postSpacingMax));
    const step = L / nBays;
    const at = (k) => ({ x: a.x + d.x * step * k, z: a.z + d.z * step * k, s: sAcc + step * k });
    const first = segs.length === 1 ? 0 : 1; // shared corner post already placed
    for (let k = first; k <= nBays; k++) posts.push(at(k));
    for (let k = 0; k < nBays; k++) bays.push({ a: at(k), d, len: step, s0: sAcc + step * k });
    sAcc += L;
  }
  if (!segs.length) {
    warnings.push('Path is too short to build a railing.');
    return { entities, warnings };
  }

  // ---- posts + baseplates (bases climb the flight) ------------------------
  for (const p of posts) {
    const rise = p.s * slope;
    entities.push(solid(
      cfg.post.profile, groundPlane(p.x, rise + y0, p.z), postLen, 'Post', cfg.post.spec));
    if (cfg.baseplate) {
      entities.push(solid(
        baseplateProfile(cfg.baseplate), groundPlane(p.x, rise, p.z), plateT,
        'Baseplate', cfg.baseplate.spec));
    }
  }

  // ---- top rail: one member per segment, top at cfg.height above the flight
  for (const s of segs) {
    entities.push(solid(
      cfg.topRail.profile,
      slopedPlane(s.a.x, cfg.height + s.s0 * slope - railH / 2, s.a.z, s.d),
      s.L * runScale, 'Top Rail', cfg.topRail.spec));
  }

  // ---- infill -------------------------------------------------------------
  if (cfg.infill?.type === 'midrails' && cfg.infill.count > 0) {
    const n = cfg.infill.count;
    for (const s of segs) {
      for (let i = 1; i <= n; i++) {
        const y = y0 + (postTop - y0) * (i / (n + 1)) + s.s0 * slope;
        entities.push(solid(
          cfg.topRail.profile, slopedPlane(s.a.x, y, s.a.z, s.d),
          s.L * runScale, 'Mid Rail', cfg.topRail.spec));
      }
    }
  } else if (cfg.infill?.type === 'pickets') {
    const pk = cfg.infill.picket;
    const pw = pk.size.w;
    const postW = cfg.post.size.w;
    const maxClear = cfg.infill.maxClear ?? 4;
    const pickLen = postTop - (y0 + 1);  // constant, even on stairs
    for (const bay of bays) {
      const clear = bay.len - postW;                 // clear width between posts
      if (clear < pw + 0.25) continue;               // bay too tight
      const spaces = Math.ceil((clear + pw) / (maxClear + pw));
      const count = spaces - 1;
      for (let j = 1; j <= count; j++) {
        const off = (bay.len / spaces) * j;
        const rise = (bay.s0 + off) * slope;
        entities.push(solid(
          pk.profile,
          groundPlane(bay.a.x + bay.d.x * off, rise + y0 + 1, bay.a.z + bay.d.z * off),
          pickLen, 'Picket', pk.spec));
      }
    }
  }

  return { entities, warnings };
}

function codeCheck(cfg) {
  const w = [];
  if (cfg.system === 'guardrail' && cfg.height < 42) {
    w.push(`Guardrail height ${cfg.height}" is below the typical 42" IBC minimum.`);
  }
  if (cfg.system === 'handrail' && (cfg.height < 34 || cfg.height > 38)) {
    w.push(`Handrail height ${cfg.height}" is outside the typical 34"–38" code range.`);
  }
  if (cfg.postSpacingMax > 72) {
    w.push(`Post spacing over 72" usually needs engineering review.`);
  }
  if (cfg.infill?.type === 'pickets' && (cfg.infill.maxClear ?? 4) > 4) {
    w.push(`Picket clear spacing over 4" fails the 4" sphere rule.`);
  }
  if (!cfg.baseplate) {
    w.push('No baseplates included — surface-mounted posts usually need plates.');
  }
  return w;
}
