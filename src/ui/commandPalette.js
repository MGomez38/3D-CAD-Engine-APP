// Command palette (Ctrl+K): fuzzy-find any tool or action by name.
// commands = [{ id, title, hint, run }]

export function buildCommandPalette(commands) {
  const overlay = document.createElement('div');
  overlay.id = 'palette-overlay';
  overlay.innerHTML = `
    <div id="palette">
      <input id="palette-input" placeholder="Type a tool or action…" autocomplete="off" spellcheck="false">
      <div id="palette-list"></div>
    </div>`;
  document.body.appendChild(overlay);

  const input = overlay.querySelector('#palette-input');
  const list = overlay.querySelector('#palette-list');
  let filtered = commands;
  let activeIdx = 0;

  function render() {
    list.innerHTML = '';
    filtered.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'palette-row' + (i === activeIdx ? ' active' : '');
      row.innerHTML = `<span>${c.title}</span>${c.hint ? `<kbd>${c.hint}</kbd>` : ''}`;
      row.addEventListener('click', () => { close(); c.run(); });
      row.addEventListener('pointermove', () => {
        if (activeIdx !== i) { activeIdx = i; render(); }
      });
      list.appendChild(row);
    });
    if (!filtered.length) {
      list.innerHTML = '<div class="palette-empty">No matching commands</div>';
    }
  }

  function open() {
    overlay.classList.add('open');
    input.value = '';
    filtered = commands;
    activeIdx = 0;
    render();
    input.focus();
  }

  function close() { overlay.classList.remove('open'); input.blur(); }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    filtered = q
      ? commands.filter(c => c.title.toLowerCase().includes(q))
      : commands;
    activeIdx = 0;
    render();
  });

  input.addEventListener('keydown', (ev) => {
    ev.stopPropagation();
    if (ev.key === 'Escape') { close(); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); activeIdx = Math.min(activeIdx + 1, filtered.length - 1); render(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); render(); }
    else if (ev.key === 'Enter' && filtered[activeIdx]) { close(); filtered[activeIdx].run(); }
  });

  overlay.addEventListener('pointerdown', (ev) => {
    if (ev.target === overlay) close();
  });

  window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      overlay.classList.contains('open') ? close() : open();
    }
  });

  return { open, close };
}
