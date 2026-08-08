import { PROFILE_CATEGORIES, categoryById } from '../lib/profiles.js';
import { MATERIALS } from '../lib/materials.js';
import { Units } from '../core/units.js';

// Stock-member picker: category → catalog size or custom dimensions,
// length, orientation, and material. Calls onConfirm(config).

export function showInsertDialog(onConfirm, prev = null) {
  let dlg = document.getElementById('insert-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'insert-dialog';
    dlg.innerHTML = `
      <h2>Insert Stock Member</h2>
      <div class="row">
        <label>Profile
          <select id="ins-cat"></select>
        </label>
        <label>Size
          <select id="ins-size"></select>
        </label>
      </div>
      <div class="row" id="ins-params"></div>
      <div class="row">
        <label>Length <input id="ins-length" value="96"></label>
        <label>Run direction
          <select id="ins-axis">
            <option value="x">Horizontal — red axis (X)</option>
            <option value="z">Horizontal — blue axis (Z)</option>
            <option value="up">Vertical — post / column</option>
          </select>
        </label>
        <label>Material
          <select id="ins-material"></select>
        </label>
      </div>
      <div class="actions">
        <button id="ins-cancel">Cancel</button>
        <button id="ins-go" class="accent">Place</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#ins-cancel').addEventListener('click', () => dlg.close());

    const catSel = dlg.querySelector('#ins-cat');
    for (const c of PROFILE_CATEGORIES) {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      catSel.appendChild(o);
    }
    const matSel = dlg.querySelector('#ins-material');
    for (const m of MATERIALS) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.name;
      matSel.appendChild(o);
    }
    catSel.addEventListener('change', () => refreshSizes(dlg));
    dlg.querySelector('#ins-size').addEventListener('change', () => refreshParams(dlg));
  }

  if (prev) {
    dlg.querySelector('#ins-cat').value = prev.categoryId;
    dlg.querySelector('#ins-axis').value = prev.axis;
    dlg.querySelector('#ins-material').value = prev.material;
    dlg.querySelector('#ins-length').value = Units.format(prev.length).replace(/\s/g, ' ');
  }
  refreshSizes(dlg, prev?.sizeIndex);

  dlg.querySelector('#ins-go').onclick = () => {
    const cat = categoryById(dlg.querySelector('#ins-cat').value);
    const params = readParams(dlg, cat);
    if (!params) return;
    const length = Units.parse(dlg.querySelector('#ins-length').value);
    if (length == null || length <= 0) { alert('Enter a valid length.'); return; }
    onConfirm({
      categoryId: cat.id,
      sizeIndex: dlg.querySelector('#ins-size').value,
      profile: cat.make(params),
      spec: cat.spec(params),
      length,
      axis: dlg.querySelector('#ins-axis').value,
      material: dlg.querySelector('#ins-material').value,
    });
    dlg.close();
  };

  dlg.showModal();
}

function refreshSizes(dlg, selectIndex) {
  const cat = categoryById(dlg.querySelector('#ins-cat').value);
  const sizeSel = dlg.querySelector('#ins-size');
  sizeSel.innerHTML = '';
  cat.sizes.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = s.label;
    sizeSel.appendChild(o);
  });
  const custom = document.createElement('option');
  custom.value = 'custom'; custom.textContent = 'Custom…';
  sizeSel.appendChild(custom);
  if (selectIndex != null) sizeSel.value = String(selectIndex);
  refreshParams(dlg);
}

function refreshParams(dlg) {
  const cat = categoryById(dlg.querySelector('#ins-cat').value);
  const isCustom = dlg.querySelector('#ins-size').value === 'custom';
  const wrap = dlg.querySelector('#ins-params');
  wrap.innerHTML = '';
  if (!isCustom) return;
  for (const p of cat.params) {
    const label = document.createElement('label');
    label.innerHTML = `${p.label} <input data-param="${p.key}" value="${p.def}">`;
    wrap.appendChild(label);
  }
}

function readParams(dlg, cat) {
  const sizeVal = dlg.querySelector('#ins-size').value;
  if (sizeVal !== 'custom') return cat.sizes[parseInt(sizeVal)];
  const params = {};
  for (const p of cat.params) {
    const input = dlg.querySelector(`#ins-params [data-param="${p.key}"]`);
    const v = Units.parse(input.value);
    if (v == null || v <= 0) { alert(`Enter a valid ${p.label}.`); return null; }
    params[p.key] = v;
  }
  return params;
}
