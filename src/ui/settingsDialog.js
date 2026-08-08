import { Settings, saveSettings } from '../core/settings.js';
import { Units } from '../core/units.js';

const SNAP_CHOICES = [
  { label: '1/16"', v: 0.0625 }, { label: '1/8"', v: 0.125 }, { label: '1/4"', v: 0.25 },
  { label: '1/2"', v: 0.5 }, { label: '1"', v: 1 }, { label: '3"', v: 3 },
  { label: '6"', v: 6 }, { label: '12"', v: 12 },
];

export function showSettingsDialog() {
  let dlg = document.getElementById('settings-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'settings-dialog';
    dlg.innerHTML = `
      <h2>Settings</h2>
      <div class="row">
        <label>Grid snap increment
          <select id="set-snap"></select>
        </label>
      </div>
      <div class="row">
        <label>Default wall height <input id="set-wallh"></label>
        <label>Default wall thickness <input id="set-wallt"></label>
      </div>
      <div class="row checks">
        <label><input type="checkbox" id="set-autosave"> Autosave to this browser</label>
      </div>
      <div class="actions">
        <button id="set-cancel">Cancel</button>
        <button id="set-go" class="accent">Apply</button>
      </div>`;
    document.body.appendChild(dlg);
    const snapSel = dlg.querySelector('#set-snap');
    for (const c of SNAP_CHOICES) {
      const o = document.createElement('option');
      o.value = String(c.v); o.textContent = c.label;
      snapSel.appendChild(o);
    }
    dlg.querySelector('#set-cancel').addEventListener('click', () => dlg.close());
  }

  dlg.querySelector('#set-snap').value = String(Settings.gridSnap);
  dlg.querySelector('#set-wallh').value = Units.format(Settings.wallHeight);
  dlg.querySelector('#set-wallt').value = Units.format(Settings.wallThickness);
  dlg.querySelector('#set-autosave').checked = Settings.autosave;

  dlg.querySelector('#set-go').onclick = () => {
    Settings.gridSnap = parseFloat(dlg.querySelector('#set-snap').value) || 1;
    const h = Units.parse(dlg.querySelector('#set-wallh').value);
    const t = Units.parse(dlg.querySelector('#set-wallt').value);
    if (h > 0) Settings.wallHeight = h;
    if (t > 0) Settings.wallThickness = t;
    Settings.autosave = dlg.querySelector('#set-autosave').checked;
    saveSettings();
    dlg.close();
  };

  dlg.showModal();
}
