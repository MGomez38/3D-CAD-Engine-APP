// Material definitions. Density is lb/in³ (used for cut-list weights).
// A null color means "use the layer color".

export const MATERIALS = [
  { id: 'steel',     name: 'Steel (A36)',    density: 0.2836, color: '#7d8894', metalness: 0.75, roughness: 0.45 },
  { id: 'stainless', name: 'Stainless 304',  density: 0.289,  color: '#a4aeb6', metalness: 0.85, roughness: 0.30 },
  { id: 'aluminum',  name: 'Aluminum 6061',  density: 0.0975, color: '#b3bbc1', metalness: 0.80, roughness: 0.35 },
  { id: 'wood',      name: 'Wood (Pine)',    density: 0.0139, color: '#c09862', metalness: 0,    roughness: 0.90 },
  { id: 'plywood',   name: 'Plywood',        density: 0.0181, color: '#caa06e', metalness: 0,    roughness: 0.90 },
  { id: 'concrete',  name: 'Concrete',       density: 0.0868, color: '#9b9b93', metalness: 0,    roughness: 1.0  },
  { id: 'generic',   name: 'Generic',        density: 0,      color: null,      metalness: 0.05, roughness: 0.85 },
];

export function materialById(id) {
  return MATERIALS.find(m => m.id === id) || MATERIALS[MATERIALS.length - 1];
}
