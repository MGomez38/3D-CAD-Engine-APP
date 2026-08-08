// Help center: quick start for newcomers + full reference for power users.

export function showHelpDialog(app) {
  let dlg = document.getElementById('help-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'help-dialog';
    dlg.innerHTML = `
      <h2>Welcome to CADShop</h2>
      <p class="help-lede">Model in 3D, then generate scaled, title-blocked drawing
      sheets, cut lists, and DXF files your shop can build from.</p>

      <div class="help-cols">
        <div>
          <h3>Quick start — 60 seconds</h3>
          <ol class="help-steps">
            <li><b>Draw</b> — press <kbd>R</kbd>, click two corners of a rectangle.</li>
            <li><b>Go 3D</b> — press <kbd>P</kbd>, click the shape, move up, type <kbd>36</kbd> <kbd>Enter</kbd>.</li>
            <li><b>Annotate</b> — press <kbd>T</kbd>, click two corners to place a dimension.</li>
            <li><b>Deliver</b> — click <b>Drawing Sheet…</b>, pick a scale, print to PDF.</li>
          </ol>
          <h3>Navigation</h3>
          <ul class="help-list">
            <li>Middle-drag orbits · right-drag pans · scroll zooms</li>
            <li>Corner gizmo or Iso/Top/Front/Right buttons snap views</li>
            <li><kbd>Shift</kbd>+<kbd>Z</kbd> zooms to fit</li>
          </ul>
          <h3>Precision</h3>
          <ul class="help-list">
            <li>Type while drawing: <code>3' 6"</code>, <code>42</code>, <code>24,12</code>, <code>@48&lt;45</code></li>
            <li><kbd>Shift</kbd> locks your current direction (axis or free)</li>
            <li><kbd>→</kbd> <kbd>←</kbd> <kbd>↑</kbd> toggle red / blue / green axis locks</li>
            <li>While locked, hover any corner to match its position</li>
          </ul>
        </div>
        <div>
          <h3>Tools</h3>
          <table class="help-keys">
            <tr><td><kbd>Space</kbd></td><td>Select (Shift adds)</td><td><kbd>L</kbd></td><td>Line</td></tr>
            <tr><td><kbd>R</kbd></td><td>Rectangle</td><td><kbd>C</kbd></td><td>Circle</td></tr>
            <tr><td><kbd>G</kbd></td><td>Polygon</td><td><kbd>P</kbd></td><td>Push/Pull</td></tr>
            <tr><td><kbd>I</kbd></td><td>Steel library</td><td><kbd>W</kbd></td><td>Wall</td></tr>
            <tr><td><kbd>O</kbd></td><td>Door/Window</td><td><kbd>M</kbd></td><td>Move (Ctrl copies)</td></tr>
            <tr><td><kbd>Q</kbd></td><td>Rotate</td><td><kbd>T</kbd></td><td>Dimension</td></tr>
            <tr><td><kbd>B</kbd></td><td>Railing designer</td><td><kbd>E</kbd></td><td>Eraser</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>Command palette</td><td><kbd>H</kbd></td><td>This help</td></tr>
          </table>
          <h3>Editing</h3>
          <table class="help-keys">
            <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd>/<kbd>Y</kbd></td><td>Undo / Redo</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd>/<kbd>V</kbd></td><td>Copy / Paste</td></tr>
            <tr><td><kbd>x5</kbd> after a move</td><td>Array 5 along that vector</td></tr>
            <tr><td>Double-click</td><td>Close a Line shape</td></tr>
            <tr><td>Entity panel</td><td>Edit sizes after placing (parametric)</td></tr>
          </table>
          <h3>Command line</h3>
          <p class="help-note">The box in the status bar accepts commands too:
          <code>wall</code>, <code>rec</code>, <code>dim</code>, <code>sheet</code>,
          <code>dxf</code>, <code>save</code>, <code>settings</code>…
          Draw a whole floor plan by keyboard:<br>
          <code>w</code> ⏎ <code>0,0</code> ⏎ <code>@20',0</code> ⏎ <code>@0,12'</code> ⏎ …</p>
        </div>
      </div>

      <div class="actions">
        <button id="help-example">Load example project</button>
        <button id="help-close" class="accent">Start modeling</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('#help-close').addEventListener('click', () => dlg.close());
    dlg.querySelector('#help-example').addEventListener('click', () => {
      app.loadExample();
      dlg.close();
    });
  }
  dlg.showModal();
}

/** One-time, non-blocking welcome nudge in the viewport corner. */
export function showWelcomeBanner(app) {
  if (localStorage.getItem('cadshop-welcomed')) return;
  const banner = document.createElement('div');
  banner.id = 'welcome-banner';
  banner.innerHTML = `
    <b>New here?</b> Draw a rectangle (R), then Push/Pull (P) to make it 3D.
    <button id="wb-help">2-minute guide</button>
    <button id="wb-example">See an example</button>
    <button id="wb-close" title="Dismiss">✕</button>`;
  document.getElementById('viewport-wrap').appendChild(banner);
  const done = () => {
    localStorage.setItem('cadshop-welcomed', '1');
    banner.remove();
  };
  banner.querySelector('#wb-help').addEventListener('click', () => { done(); showHelpDialog(app); });
  banner.querySelector('#wb-example').addEventListener('click', () => { done(); app.loadExample(); });
  banner.querySelector('#wb-close').addEventListener('click', done);
}
