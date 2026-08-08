import { Units } from '../core/units.js';

// Door / window configuration for the Opening tool.

const PRESETS = [
  { label: 'Door 2\'-6" × 6\'-8"', kind: 'door', w: 30, h: 80 },
  { label: 'Door 3\'-0" × 6\'-8"', kind: 'door', w: 36, h: 80 },
  { label: 'Double door 6\'-0" × 6\'-8"', kind: 'door', w: 72, h: 80 },
  { label: 'Window 3\'-0" × 3\'-0" (sill 3\')', kind: 'window', w: 36, h: 36, sill: 36 },
  { label: 'Window 4\'-0" × 3\'-0" (sill 3\')', kind: 'window', w: 48, h: 36, sill: 36 },
  { label: 'Window 6\'-0" × 4\'-0" (sill 2\'-6")', kind: 'window', w: 72, h: 48, sill: 30 },
  { label: 'Garage door 9\'-0" × 7\'-0"', kind: 'door', w: 108, h: 84 },
];

export function showOpeningDialog(onConfirm, prev) {
  let dlg = document.getElementById('opening-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'opening-dialog';
    dlg.innerHTML = `
      <h2>Door / Window Opening</h2>
      <div class="row">
        <label>Preset
          <select id="opn-preset"></select>
        </label>
      </div>
      <div class="row">
        <label>Type
          <select id="opn-kind">
            <option value="door">Door (from floor)</option>
            <option value="window">Window</option>
          </select>
        </label>
        <label>Width <input id="opn-w" value="36"></label>
        <label>Height <input id="opn-h" value="80"></label>
        <label id="opn-sill-label">Sill height <input id="opn-sill" value="36"></label>
      </div>
      <div class="actions">
        <button id="opn-cancel">Cancel</button>
        <button id="opn-go" class="accent">Place on walls</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#opn-cancel').addEventListener('click', () => dlg.close());

    const presetSel = dlg.querySelector('#opn-preset');
    PRESETS.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i); o.textContent = p.label;
      presetSel.appendChild(o);
    });
    presetSel.addEventListener('change', () => {
      const p = PRESETS[parseInt(presetSel.value)];
      dlg.querySelector('#opn-kind').value = p.kind;
      dlg.querySelector('#opn-w').value = Units.format(p.w);
      dlg.querySelector('#opn-h').value = Units.format(p.h);
      if (p.sill != null) dlg.querySelector('#opn-sill').value = Units.format(p.sill);
      syncSill(dlg);
    });
    dlg.querySelector('#opn-kind').addEventListener('change', () => syncSill(dlg));
  }

  if (prev) {
    dlg.querySelector('#opn-kind').value = prev.kind;
    dlg.querySelector('#opn-w').value = Units.format(prev.w);
    dlg.querySelector('#opn-h').value = Units.format(prev.h);
    dlg.querySelector('#opn-sill').value = Units.format(prev.sill);
  }
  syncSill(dlg);

  dlg.querySelector('#opn-go').onclick = () => {
    const w = Units.parse(dlg.querySelector('#opn-w').value);
    const h = Units.parse(dlg.querySelector('#opn-h').value);
    const sill = Units.parse(dlg.querySelector('#opn-sill').value) ?? 36;
    if (w == null || h == null || w <= 0 || h <= 0) { alert('Enter a valid width and height.'); return; }
    onConfirm({ kind: dlg.querySelector('#opn-kind').value, w, h, sill });
    dlg.close();
  };

  dlg.showModal();
}

function syncSill(dlg) {
  const isWindow = dlg.querySelector('#opn-kind').value === 'window';
  dlg.querySelector('#opn-sill-label').style.display = isWindow ? '' : 'none';
}
