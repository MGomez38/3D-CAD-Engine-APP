// Left tool palette: buttons with inline SVG icons + keyboard shortcuts.

const ICONS = {
  select: '<path d="M6 3 L18 12 L12 13 L15 20 L12.5 21 L10 14 L6 17 Z"/>',
  line: '<path d="M4 20 L20 4"/><circle cx="4" cy="20" r="1.6"/><circle cx="20" cy="4" r="1.6"/>',
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  pushpull: '<rect x="5" y="12" width="14" height="8"/><path d="M12 9 V2 M9 5 L12 2 L15 5"/>',
  move: '<path d="M12 3 V21 M3 12 H21 M9 6 L12 3 L15 6 M9 18 L12 21 L15 18 M6 9 L3 12 L6 15 M18 9 L21 12 L18 15"/>',
  rotate: '<path d="M19 12 A7 7 0 1 1 12 5"/><path d="M12 2 L12 8 L17 5 Z"/>',
  dimension: '<path d="M4 16 V20 M20 16 V20 M4 18 H20 M6.5 16.2 L4 18 L6.5 19.8 M17.5 16.2 L20 18 L17.5 19.8"/><path d="M7 8 H17" stroke-dasharray="2 2"/>',
  eraser: '<path d="M4 16 L12 8 L20 16 L14 22 H10 Z"/><path d="M8 12 L16 20"/>',
};

export const TOOLS = [
  { id: 'select', label: 'Select', key: ' ' , keyLabel: 'Space' },
  { id: 'line', label: 'Line', key: 'l', keyLabel: 'L' },
  { id: 'rect', label: 'Rect', key: 'r', keyLabel: 'R' },
  { id: 'circle', label: 'Circle', key: 'c', keyLabel: 'C' },
  { id: 'pushpull', label: 'Push/Pull', key: 'p', keyLabel: 'P' },
  { id: 'move', label: 'Move', key: 'm', keyLabel: 'M' },
  { id: 'rotate', label: 'Rotate', key: 'q', keyLabel: 'Q' },
  { id: 'dimension', label: 'Dim', key: 't', keyLabel: 'T' },
  { id: 'eraser', label: 'Erase', key: 'e', keyLabel: 'E' },
];

export function buildToolbar(container, onSelect) {
  const buttons = new Map();
  for (const t of TOOLS) {
    const btn = document.createElement('button');
    btn.className = 'tool-btn';
    btn.title = `${t.label} (${t.keyLabel})`;
    btn.innerHTML =
      `<svg viewBox="0 0 24 24" stroke-linejoin="round" stroke-linecap="round">${ICONS[t.id]}</svg>` +
      `<span>${t.label}</span>`;
    btn.addEventListener('click', () => onSelect(t.id));
    container.appendChild(btn);
    buttons.set(t.id, btn);
  }
  return {
    setActive(id) {
      for (const [tid, b] of buttons) b.classList.toggle('active', tid === id);
    },
  };
}
