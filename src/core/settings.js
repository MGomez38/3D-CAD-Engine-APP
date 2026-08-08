// App-wide settings, persisted to localStorage.

export const Settings = {
  gridSnap: 1,        // sketch-plane snap increment, inches
  wallHeight: 96,     // default wall height
  wallThickness: 4.5, // default wall thickness (2x4 + drywall)
  displayStyle: 'shaded-edges', // shaded-edges | shaded | xray | wireframe
  autosave: true,
};

const KEY = 'cadshop-settings';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    Object.assign(Settings, saved);
  } catch { /* corrupted settings are ignored */ }
}

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(Settings)); } catch { /* quota */ }
}
