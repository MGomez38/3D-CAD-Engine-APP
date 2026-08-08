import { SCALES, renderViews, openSheet } from '../drawing/sheet.js';

// Modal dialog for configuring and generating a drawing sheet.

export function showSheetDialog(model) {
  let dlg = document.getElementById('sheet-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'sheet-dialog';
    dlg.innerHTML = `
      <h2>Generate Drawing Sheet</h2>
      <div class="row"><label>Views to include
        <div class="checks" style="margin-top:6px">
          <label><input type="checkbox" value="top" checked> Plan</label>
          <label><input type="checkbox" value="front" checked> Front</label>
          <label><input type="checkbox" value="right" checked> Right</label>
          <label><input type="checkbox" value="left"> Left</label>
          <label><input type="checkbox" value="back"> Rear</label>
          <label><input type="checkbox" value="iso" checked> Isometric</label>
        </div>
      </label></div>
      <div class="row">
        <label>Scale
          <select id="sheet-scale">
            <option value="">Fit to sheet (not to scale)</option>
          </select>
        </label>
        <label>Paper
          <select id="sheet-paper">
            <option value="letter">Letter 11 × 8.5</option>
            <option value="tabloid" selected>Tabloid 17 × 11</option>
            <option value="archd">Arch D 36 × 24</option>
          </select>
        </label>
      </div>
      <div class="actions">
        <button id="sheet-cancel">Cancel</button>
        <button id="sheet-go" class="accent">Generate</button>
      </div>`;
    document.body.appendChild(dlg);
    const scaleSel = dlg.querySelector('#sheet-scale');
    SCALES.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = s.label;
      scaleSel.appendChild(opt);
    });
    dlg.querySelector('#sheet-cancel').addEventListener('click', () => dlg.close());
  }

  const go = dlg.querySelector('#sheet-go');
  go.onclick = () => {
    const keys = [...dlg.querySelectorAll('.checks input:checked')].map(c => c.value);
    if (!keys.length) return;
    const views = renderViews(model, keys);
    if (!views.length) { alert('Nothing to draw yet — model something first.'); return; }
    const scaleIdx = dlg.querySelector('#sheet-scale').value;
    const scale = scaleIdx === '' ? null : SCALES[parseInt(scaleIdx)];
    const paper = dlg.querySelector('#sheet-paper').value;
    openSheet(views, model.projectInfo, scale?.label || '', scale?.factor || null, paper);
    dlg.close();
  };

  dlg.showModal();
}
