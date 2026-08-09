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
  insert: '<path d="M5 4 H19 M5 20 H19 M12 4 V20 M8 4 H16 M8 20 H16" transform="translate(0,0)"/><path d="M5 4 H19 M5 20 H19 M12 4 V20"/>',
  polygon: '<path d="M12 3 L20 9 L17 19 L7 19 L4 9 Z"/>',
  rail: '<path d="M3 8 H21 M3 12 H21 M5 8 V20 M12 8 V20 M19 8 V20 M3 20 H7 M10 20 H14 M17 20 H21"/>',
  label: '<path d="M4 5 H20 V15 H12 L8 19 V15 H4 Z"/><path d="M8 9 H16 M8 12 H13"/>',
  section: '<path d="M3 12 H21" stroke-dasharray="3 2"/><path d="M6 12 V19 H18 V12 M9 5 H15 V12"/>',
  wall: '<path d="M3 20 V8 L21 4 V16 Z"/><path d="M3 14 L21 10 M9 6.7 V18.7 M15 5.4 V17.4"/>',
  opening: '<path d="M3 20 H21 M5 20 V6 H19 V20"/><path d="M9 20 V10 H15 V20"/>',
};

export const TOOLS = [
  { id: 'select', label: 'Select', key: ' ' , keyLabel: 'Space', group: 'Draw' },
  { id: 'line', label: 'Line', key: 'l', keyLabel: 'L', group: 'Draw' },
  { id: 'rect', label: 'Rect', key: 'r', keyLabel: 'R', group: 'Draw' },
  { id: 'circle', label: 'Circle', key: 'c', keyLabel: 'C', group: 'Draw' },
  { id: 'polygon', label: 'Polygon', key: 'g', keyLabel: 'G', group: 'Draw' },
  { id: 'pushpull', label: 'Push/Pull', key: 'p', keyLabel: 'P', group: 'Build' },
  { id: 'insert', label: 'Steel', key: 'i', keyLabel: 'I', group: 'Build' },
  { id: 'rail', label: 'Railing', key: 'b', keyLabel: 'B', group: 'Build' },
  { id: 'wall', label: 'Wall', key: 'w', keyLabel: 'W', group: 'Build' },
  { id: 'opening', label: 'Door/Win', key: 'o', keyLabel: 'O', group: 'Build' },
  { id: 'move', label: 'Move', key: 'm', keyLabel: 'M', group: 'Modify' },
  { id: 'rotate', label: 'Rotate', key: 'q', keyLabel: 'Q', group: 'Modify' },
  { id: 'eraser', label: 'Erase', key: 'e', keyLabel: 'E', group: 'Modify' },
  { id: 'dimension', label: 'Dim', key: 't', keyLabel: 'T', group: 'Annotate' },
  { id: 'label', label: 'Note', key: 'n', keyLabel: 'N', group: 'Annotate' },
  { id: 'section', label: 'Section', key: 'x', keyLabel: 'X', group: 'Annotate' },
];

export function buildToolbar(container, onSelect) {
  const buttons = new Map();
  let currentGroup = null;
  for (const t of TOOLS) {
    if (t.group !== currentGroup) {
      currentGroup = t.group;
      const cap = document.createElement('div');
      cap.className = 'tool-group';
      cap.textContent = t.group;
      container.appendChild(cap);
    }
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
