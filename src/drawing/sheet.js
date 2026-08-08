import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// Drawing-sheet generator.
//
// Renders orthographic "hidden-line style" views (white model, dark edges,
// white background) of the current geometry, then opens a printable sheet
// with a professional title block. Print → Save as PDF gives the customer
// deliverable.

export const SCALES = [
  { label: '3" = 1\'-0"', factor: 3 / 12 },
  { label: '1 1/2" = 1\'-0"', factor: 1.5 / 12 },
  { label: '1" = 1\'-0"', factor: 1 / 12 },
  { label: '3/4" = 1\'-0"', factor: 0.75 / 12 },
  { label: '1/2" = 1\'-0"', factor: 0.5 / 12 },
  { label: '1/4" = 1\'-0"', factor: 0.25 / 12 },
  { label: '1/8" = 1\'-0"', factor: 0.125 / 12 },
];

const VIEW_DEFS = {
  top:   { title: 'PLAN VIEW',       dir: new THREE.Vector3(0, 1, 0),  up: new THREE.Vector3(0, 0, -1) },
  front: { title: 'FRONT ELEVATION', dir: new THREE.Vector3(0, 0, 1),  up: new THREE.Vector3(0, 1, 0) },
  right: { title: 'RIGHT ELEVATION', dir: new THREE.Vector3(1, 0, 0),  up: new THREE.Vector3(0, 1, 0) },
  left:  { title: 'LEFT ELEVATION',  dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  back:  { title: 'REAR ELEVATION',  dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  iso:   { title: 'ISOMETRIC (NTS)', dir: new THREE.Vector3(1, 0.82, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
};

/**
 * Render the requested views to data-URL images.
 * Returns [{ key, title, dataUrl, worldW, worldH }] where worldW/H are the
 * view extents in model inches (for true-to-scale printing).
 */
export function renderViews(model, viewKeys) {
  const bounds = new THREE.Box3();
  for (const [id, obj] of model.objects) {
    const e = model.entities.get(id);
    if (!e || (e.type !== 'solid' && e.type !== 'profile') || !obj.visible) continue;
    bounds.expandByObject(obj);
  }
  if (bounds.isEmpty()) return [];

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 1);

  // dedicated offscreen renderer + a scene of white meshes / black edges
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(1, 2, 1.2);
  scene.add(key);

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf4f4f4, roughness: 1, metalness: 0, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
  });
  // fat lines (screen-space width) so linework survives print scaling
  const edgeMat = new LineMaterial({ color: 0x111111, linewidth: 3 });

  for (const [id, obj] of model.objects) {
    const e = model.entities.get(id);
    if (!e || (e.type !== 'solid' && e.type !== 'profile') || !obj.visible) continue;
    obj.updateWorldMatrix(true, true);
    obj.traverse(c => {
      if (c.isMesh) {
        const mesh = new THREE.Mesh(c.geometry, whiteMat);
        mesh.applyMatrix4(c.matrixWorld);
        scene.add(mesh);
        const edgeGeo = new LineSegmentsGeometry().fromEdgesGeometry(
          new THREE.EdgesGeometry(c.geometry, 15));
        const edges = new LineSegments2(edgeGeo, edgeMat);
        edges.applyMatrix4(c.matrixWorld);
        scene.add(edges);
      }
    });
  }

  const results = [];
  for (const keyName of viewKeys) {
    const def = VIEW_DEFS[keyName];
    if (!def) continue;

    // fit an ortho frustum around the bounds as seen from this direction
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 10);
    cam.position.copy(center.clone().addScaledVector(def.dir, radius * 3));
    cam.up.copy(def.up);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);

    // project the 8 bounds corners into camera space to get tight extents
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const inv = cam.matrixWorldInverse;
    for (const cx of [bounds.min.x, bounds.max.x])
      for (const cy of [bounds.min.y, bounds.max.y])
        for (const cz of [bounds.min.z, bounds.max.z]) {
          const p = new THREE.Vector3(cx, cy, cz).applyMatrix4(inv);
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
    const pad = Math.max((maxX - minX), (maxY - minY)) * 0.05 + 2;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const worldW = maxX - minX, worldH = maxY - minY;

    cam.left = minX; cam.right = maxX; cam.top = maxY; cam.bottom = minY;
    cam.updateProjectionMatrix();

    const maxDim = 2000;
    const aspect = worldW / worldH;
    const w = aspect >= 1 ? maxDim : Math.round(maxDim * aspect);
    const h = aspect >= 1 ? Math.round(maxDim / aspect) : maxDim;
    renderer.setSize(w, h, false);
    edgeMat.resolution.set(w, h);
    renderer.render(scene, cam);
    results.push({ key: keyName, title: def.title, dataUrl: canvas.toDataURL('image/png'), worldW, worldH });
  }

  renderer.dispose();
  return results;
}

/** Open a printable sheet window. `scaleFactor` = paper-inch per model-inch, or null for fit. */
export function openSheet(views, info, scaleLabel, scaleFactor, paper) {
  const paperSizes = {
    letter: { w: 11, h: 8.5, name: 'ANSI A 11×8.5' },
    tabloid: { w: 17, h: 11, name: 'ANSI B 17×11' },
    archd: { w: 36, h: 24, name: 'ARCH D 36×24' },
  };
  const p = paperSizes[paper] || paperSizes.tabloid;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });

  const viewsHtml = views.map(v => {
    let style;
    if (scaleFactor) {
      style = `width:${(v.worldW * scaleFactor).toFixed(3)}in;height:${(v.worldH * scaleFactor).toFixed(3)}in;`;
    } else {
      style = 'max-width:45%;max-height:4.5in;';
    }
    if (v.key === 'iso') style = 'max-width:38%;max-height:4in;';
    const cap = v.key === 'iso' || !scaleFactor ? v.title : `${v.title} — SCALE ${scaleLabel}`;
    return `<figure><img src="${v.dataUrl}" style="${style}"><figcaption>${cap}</figcaption></figure>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(info.number) || 'Drawing'} — ${esc(info.project) || 'Untitled'}</title>
<style>
  @page { size: ${p.w}in ${p.h}in; margin: 0; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: 'Arial Narrow', Arial, sans-serif; color: #111; background: #888; }
  .sheet {
    width: ${p.w}in; height: ${p.h}in; background: #fff; margin: 0 auto;
    padding: 0.25in; display: flex; flex-direction: column;
  }
  .frame { flex: 1; border: 2.5px solid #111; display: flex; flex-direction: column; min-height: 0; }
  .views {
    flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-evenly;
    align-content: space-evenly; overflow: hidden; padding: 0.2in;
  }
  figure { text-align: center; }
  img { display: block; margin: 0 auto; }
  figcaption { font-size: 9pt; font-weight: bold; letter-spacing: 0.06em; margin-top: 4pt; }
  table.tb { border-collapse: collapse; width: 100%; border-top: 2.5px solid #111; }
  .tb td { border: 1px solid #111; padding: 3pt 6pt; font-size: 8pt; vertical-align: top; }
  .tb .lbl { font-size: 6pt; color: #444; display: block; letter-spacing: 0.08em; }
  .tb .big { font-size: 13pt; font-weight: bold; }
  .toolbar { text-align: center; padding: 8px; }
  .toolbar button { font-size: 14px; padding: 6px 18px; }
  @media print { .toolbar { display: none; } body { background: #fff; } }
</style></head><body>
<div class="toolbar"><button onclick="print()">Print / Save as PDF</button></div>
<div class="sheet"><div class="frame">
  <div class="views">${viewsHtml}</div>
  <table class="tb"><tr>
    <td style="width:30%"><span class="lbl">PROJECT</span>${esc(info.project) || '—'}</td>
    <td style="width:25%"><span class="lbl">CUSTOMER</span>${esc(info.customer) || '—'}</td>
    <td style="width:12%"><span class="lbl">DRAWN BY</span>${esc(info.author) || '—'}</td>
    <td style="width:11%"><span class="lbl">DATE</span>${today}</td>
    <td style="width:11%"><span class="lbl">SCALE</span>${scaleFactor ? scaleLabel : 'AS NOTED'}</td>
    <td style="width:11%" rowspan="1"><span class="lbl">DRAWING NO.</span><span class="big">${esc(info.number) || '—'}</span></td>
  </tr></table>
</div></div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Pop-up blocked — allow pop-ups to generate drawing sheets.'); return; }
  win.document.write(html);
  win.document.close();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
