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

/**
 * @param path   [{x,z}, ...] 2+ ground points (level, straight segments)
 * @param cfg    {
 *   system: 'guardrail'|'handrail', height, postSpacingMax,
 *   post:    { profile, spec, size:{w,h} },
 *   topRail: { profile, spec, size:{w,h} },
 *   infill:  { type:'none'|'midrails'|'pickets', count, picket:{profile,spec,size}, maxClear },
 *   baseplate: null | { w,h,t,holeD,edge,holeCount,spec },
 *   material: 'steel',
 * }
 * @returns { entities:[solidDesc...], warnings:[string...] }
 */
export function generateRailing(path, cfg) {
  const warnings = codeCheck(cfg);
  const entities = [];

  const plateT = cfg.baseplate ? cfg.baseplate.t : 0;
  const railH = cfg.topRail.size.h;
  const postTop = cfg.height - railH;  // underside of the top rail
  const y0 = plateT;                   // top of baseplate = bottom of post
  const postLen = postTop - y0;
  if (postLen <= 0) {
    warnings.push('Railing height is too small for the chosen top rail.');
    return { entities, warnings };
  }

  const solid = (profile, plane, depth, name, spec) => ({
    type: 'solid', ...profile, plane, depth,
    name, spec, material: cfg.material, transform: null,
  });
  const groundPlane = (x, y, z) => ({ origin: [x, y, z], u: [1, 0, 0], v: [0, 0, -1] });
  const alongPlane = (x, y, z, d) => ({ origin: [x, y, z], u: [d.z, 0, -d.x], v: [0, 1, 0] });

  // ---- segments and post layout ------------------------------------------
  const segs = [];
  const posts = []; // {x,z}
  const bays = [];  // {a:{x,z}, d, len} between adjacent posts of one segment

  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const d = { x: dx / L, z: dz / L };
    segs.push({ a, d, L });

    const nBays = Math.max(1, Math.ceil(L / cfg.postSpacingMax));
    const step = L / nBays;
    const at = (k) => ({ x: a.x + d.x * step * k, z: a.z + d.z * step * k });
    const first = segs.length === 1 ? 0 : 1; // shared corner post already placed
    for (let k = first; k <= nBays; k++) posts.push(at(k));
    for (let k = 0; k < nBays; k++) bays.push({ a: at(k), d, len: step });
  }
  if (!segs.length) {
    warnings.push('Path is too short to build a railing.');
    return { entities, warnings };
  }

  // ---- posts + baseplates -------------------------------------------------
  for (const p of posts) {
    entities.push(solid(
      cfg.post.profile, groundPlane(p.x, y0, p.z), postLen, 'Post', cfg.post.spec));
    if (cfg.baseplate) {
      entities.push(solid(
        baseplateProfile(cfg.baseplate), groundPlane(p.x, 0, p.z), plateT,
        'Baseplate', cfg.baseplate.spec));
    }
  }

  // ---- top rail: one member per segment, top flush at cfg.height ----------
  for (const s of segs) {
    entities.push(solid(
      cfg.topRail.profile,
      alongPlane(s.a.x, cfg.height - railH / 2, s.a.z, s.d),
      s.L, 'Top Rail', cfg.topRail.spec));
  }

  // ---- infill -------------------------------------------------------------
  if (cfg.infill?.type === 'midrails' && cfg.infill.count > 0) {
    const n = cfg.infill.count;
    for (const s of segs) {
      for (let i = 1; i <= n; i++) {
        const y = y0 + (postTop - y0) * (i / (n + 1));
        entities.push(solid(
          cfg.topRail.profile, alongPlane(s.a.x, y, s.a.z, s.d),
          s.L, 'Mid Rail', cfg.topRail.spec));
      }
    }
  } else if (cfg.infill?.type === 'pickets') {
    const pk = cfg.infill.picket;
    const pw = pk.size.w;
    const postW = cfg.post.size.w;
    const maxClear = cfg.infill.maxClear ?? 4;
    const pickLen = postTop - (y0 + 1);
    for (const bay of bays) {
      const clear = bay.len - postW;                 // clear width between posts
      if (clear < pw + 0.25) continue;               // bay too tight
      const spaces = Math.ceil((clear + pw) / (maxClear + pw));
      const count = spaces - 1;
      for (let j = 1; j <= count; j++) {
        const off = (bay.len / spaces) * j;
        entities.push(solid(
          pk.profile,
          groundPlane(bay.a.x + bay.d.x * off, y0 + 1, bay.a.z + bay.d.z * off),
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
