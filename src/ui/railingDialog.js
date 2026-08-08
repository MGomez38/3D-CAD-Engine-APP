import { Units } from '../core/units.js';
import { MATERIALS } from '../lib/materials.js';

// Railing system configurator — presets for common guardrail/handrail builds,
// every part swappable. Produces a complete generateRailing() config.

const hss = (w, h, t) => ({
  kind: 'poly',
  points: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
  holes: [[
    [-(w / 2 - t), -(h / 2 - t)], [-(w / 2 - t), h / 2 - t],
    [w / 2 - t, h / 2 - t], [w / 2 - t, -(h / 2 - t)],
  ]],
});
const pipe = (od, wall) => ({ kind: 'circle', center: [0, 0], radius: od / 2, innerRadius: od / 2 - wall });
const bar = (w, h) => ({
  kind: 'poly',
  points: [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
});

const MEMBERS = [
  { id: 'hss15', label: 'HSS 1-1/2 × 1-1/2 × 1/8', profile: hss(1.5, 1.5, 0.125), spec: 'HSS 1-1/2x1-1/2x1/8', size: { w: 1.5, h: 1.5 } },
  { id: 'hss2', label: 'HSS 2 × 2 × 1/4', profile: hss(2, 2, 0.25), spec: 'HSS 2x2x1/4', size: { w: 2, h: 2 } },
  { id: 'pipe15', label: 'Pipe 1-1/2 Sch 40 (1.9 OD)', profile: pipe(1.9, 0.145), spec: 'Pipe 1-1/2 Sch40', size: { w: 1.9, h: 1.9 } },
  { id: 'pipe125', label: 'Pipe 1-1/4 Sch 40 (1.66 OD)', profile: pipe(1.66, 0.14), spec: 'Pipe 1-1/4 Sch40', size: { w: 1.66, h: 1.66 } },
  { id: 'bar15', label: 'Square bar 1-1/2', profile: bar(1.5, 1.5), spec: 'SQ 1-1/2', size: { w: 1.5, h: 1.5 } },
];

const INFILLS = [
  { id: 'none', label: 'None (posts + top rail only)' },
  { id: 'mid1', label: '1 mid rail' },
  { id: 'mid2', label: '2 mid rails' },
  { id: 'pickets', label: 'Pickets 1/2" sq @ 4" max clear' },
];

const BASEPLATES = [
  { id: 'none', label: 'None' },
  { id: 'bp44', label: '4×4 × 1/4, 4 bolts', w: 4, h: 4, t: 0.25, holeD: 0.3125, edge: 0.75, holeCount: 4, spec: 'BP 4x4x1/4' },
  { id: 'bp66', label: '6×6 × 3/8, 4 bolts', w: 6, h: 6, t: 0.375, holeD: 0.4375, edge: 1, holeCount: 4, spec: 'BP 6x6x3/8' },
];

const PRESETS = [
  { label: 'Industrial guardrail 42" — 2 mid rails', system: 'guardrail', height: 42, spacing: 48, post: 'hss15', rail: 'hss15', infill: 'mid2', bp: 'bp44' },
  { label: 'Picket guardrail 42" — 4" sphere rule', system: 'guardrail', height: 42, spacing: 48, post: 'hss15', rail: 'hss15', infill: 'pickets', bp: 'bp44' },
  { label: 'Pipe handrail 36"', system: 'handrail', height: 36, spacing: 48, post: 'pipe15', rail: 'pipe15', infill: 'none', bp: 'bp44' },
  { label: 'Heavy guardrail 42" — HSS 2x2', system: 'guardrail', height: 42, spacing: 60, post: 'hss2', rail: 'hss15', infill: 'mid2', bp: 'bp66' },
];

export function showRailingDialog(onConfirm, prev) {
  let dlg = document.getElementById('railing-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'railing-dialog';
    dlg.innerHTML = `
      <h2>Railing Designer</h2>
      <div class="row"><label>System preset <select id="rl-preset"></select></label></div>
      <div class="row">
        <label>Type
          <select id="rl-system">
            <option value="guardrail">Guardrail</option>
            <option value="handrail">Handrail</option>
          </select>
        </label>
        <label>Height <input id="rl-height" value='42"'></label>
        <label>Max post spacing <input id="rl-spacing" value='48"'></label>
      </div>
      <div class="row">
        <label>Posts <select id="rl-post"></select></label>
        <label>Top rail <select id="rl-rail"></select></label>
      </div>
      <div class="row">
        <label>Infill <select id="rl-infill"></select></label>
        <label>Baseplates <select id="rl-bp"></select></label>
        <label>Material <select id="rl-material"></select></label>
      </div>
      <p class="muted" id="rl-note">Click a path in the model, then press Enter — posts, rails,
      infill, and baseplates are generated and added to the cut list.</p>
      <div class="actions">
        <button id="rl-cancel">Cancel</button>
        <button id="rl-go" class="accent">Draw railing path</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#rl-cancel').addEventListener('click', () => dlg.close());

    const fill = (sel, items, labelKey = 'label') => {
      const el = dlg.querySelector(sel);
      items.forEach((it, i) => {
        const o = document.createElement('option');
        o.value = it.id ?? String(i);
        o.textContent = it[labelKey];
        el.appendChild(o);
      });
    };
    fill('#rl-preset', PRESETS.map((p, i) => ({ id: String(i), label: p.label })));
    fill('#rl-post', MEMBERS);
    fill('#rl-rail', MEMBERS);
    fill('#rl-infill', INFILLS);
    fill('#rl-bp', BASEPLATES);
    fill('#rl-material', MATERIALS.map(m => ({ id: m.id, label: m.name })));

    dlg.querySelector('#rl-preset').addEventListener('change', (ev) => {
      const p = PRESETS[parseInt(ev.target.value)];
      dlg.querySelector('#rl-system').value = p.system;
      dlg.querySelector('#rl-height').value = Units.format(p.height);
      dlg.querySelector('#rl-spacing').value = Units.format(p.spacing);
      dlg.querySelector('#rl-post').value = p.post;
      dlg.querySelector('#rl-rail').value = p.rail;
      dlg.querySelector('#rl-infill').value = p.infill;
      dlg.querySelector('#rl-bp').value = p.bp;
    });
  }

  if (prev?.presetId != null) dlg.querySelector('#rl-preset').value = prev.presetId;

  dlg.querySelector('#rl-go').onclick = () => {
    const height = Units.parse(dlg.querySelector('#rl-height').value);
    const spacing = Units.parse(dlg.querySelector('#rl-spacing').value);
    if (height == null || height <= 6 || spacing == null || spacing <= 6) {
      alert('Enter a valid height and post spacing.');
      return;
    }
    const post = MEMBERS.find(m => m.id === dlg.querySelector('#rl-post').value);
    const rail = MEMBERS.find(m => m.id === dlg.querySelector('#rl-rail').value);
    const infillId = dlg.querySelector('#rl-infill').value;
    const bpDef = BASEPLATES.find(b => b.id === dlg.querySelector('#rl-bp').value);
    const system = dlg.querySelector('#rl-system').value;

    const infill =
      infillId === 'mid1' ? { type: 'midrails', count: 1 } :
      infillId === 'mid2' ? { type: 'midrails', count: 2 } :
      infillId === 'pickets' ? {
        type: 'pickets', maxClear: 4,
        picket: { profile: bar(0.5, 0.5), spec: 'SQ 1/2 picket', size: { w: 0.5, h: 0.5 } },
      } : { type: 'none' };

    onConfirm({
      label: system === 'guardrail' ? 'Guardrail' : 'Handrail',
      presetId: dlg.querySelector('#rl-preset').value,
      system, height, postSpacingMax: spacing,
      post: { profile: post.profile, spec: post.spec, size: post.size },
      topRail: { profile: rail.profile, spec: rail.spec, size: rail.size },
      infill,
      baseplate: bpDef.id === 'none' ? null : { ...bpDef },
      material: dlg.querySelector('#rl-material').value,
    });
    dlg.close();
  };

  dlg.showModal();
}
