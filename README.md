# CADShop — 3D CAD for Shop & Architectural Drawings

A browser-based 3D CAD application with a SketchUp-style workflow, built for
producing **engineered shop drawings**, **metal fabrication layouts**, and
**architectural drawings** for customers. Model in 3D with a structural steel
library, get a live cut list with weights, then generate scaled,
auto-dimensioned, title-blocked drawing sheets ready to print or save as PDF —
plus DXF flat patterns for the plasma/laser table.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/) —
no plugins, no backend, runs entirely in the browser.

## Professional workflow

**Command line (AutoCAD-style).** The Command box accepts tool aliases and
precise coordinates:

| Input | Meaning |
|-------|---------|
| `L`, `REC`, `C`, `POL`, `PP`, `M`, `RO`, `E`, `DIM`, `W`, `DOOR`, `STEEL` | activate tools |
| `24,12` | absolute point (x = east, y = north, inches or `3'6"`) |
| `@24,12` | relative to the last point |
| `@48<45` | polar: 48" at 45° |
| `Z` / `FIT`, `U` / `REDO`, `SHEET`, `DXF`, `STL`, `SAVE`, `SETTINGS` | actions |

Draw an entire floor plan without touching the mouse:
`W` ⏎ `0,0` ⏎ `@20',0` ⏎ `@0,12'` ⏎ `@-20',0` ⏎ `@0,-12'` ⏎

**Walls & openings (Revit-style).** The Wall tool (`W`) draws walls in plan at
your default height/thickness (Settings) and chains corner to corner. The
Door/Window tool (`O`) offers standard presets (3'0"×6'8" door, sliding sizes,
garage door…) or custom sizes and cuts a real opening into any wall — the
geometry, drawings, and DXF all update.

**Parametric editing (Fusion-style).** Select any object and edit its
dimensions in the Entity panel — width, height, radius, length/thickness —
plus part name, material, and layer. Walls keep their door/window openings
anchored when resized.

**Navigation.** A clickable orientation gizmo sits in the bottom-right corner
(click an axis to snap the view). Display styles: Shaded + Edges, Shaded,
X-Ray, and Wireframe.

**Autosave.** Work is continuously saved to the browser; after a crash or
accidental tab close you'll be offered a restore on relaunch.

## Railing designer (guardrails & handrails)

Press `B`, pick a system, click a path, press Enter — the **entire railing is
generated**: posts auto-spaced to your max spacing (no duplicate corner
posts), top rail flush at the target height, mid-rails or vertical pickets at
the 4"-sphere-rule spacing, and **bolt-hole baseplates** under every post.

- Presets: Industrial guardrail 42" (2 mid rails) · Picket guardrail 42" ·
  Pipe handrail 36" · Heavy HSS 2x2 guardrail — every member swappable
  (HSS, Sch 40 pipe, square bar) and any material.
- **Code awareness**: warns when a guardrail is under 42", a handrail is
  outside 34"–38", posts exceed 72" spacing, or picket gaps exceed 4".
- Every part lands in the cut list with correct specs and weights, and the
  baseplates (with hole circles) export to DXF for the plasma table.
- Baseplates are also available standalone in the Steel library (`I`).

## Metal fabrication workflow

1. **Steel tool (`I`)** — pick a stock profile and place members with a click:
   - Angle (L), Channel (C), Wide Flange (W), Square/Rect Tube (HSS),
     Pipe & Round Tube, Flat Bar, Round Bar, Plate
   - Real catalog sizes (L 2x2x1/4, HSS 4x4x1/4, C6x8.2, W8x31, Sch 40 pipe, …)
     or fully custom dimensions
   - Run horizontally along either axis or vertically as posts; set length in
     the dialog or type a new length + Enter while placing
2. **Cut list / BOM** — updates live as you model: description, cut length,
   quantity (identical parts group automatically), and weight from real
   material densities (steel, stainless, aluminum, wood…). Export CSV or
   include it on the drawing sheet.
3. **Copy & array** — Ctrl+click with Move copies; after any move type
   `x4` + Enter to array along the same vector (fence posts, rungs, studs).
4. **DXF export** — every part's flat cross-section laid out with closed
   polylines in inches, ready for plasma/laser/waterjet nesting software.
5. **Drawing sheets** — orthographic views with automatic overall dimensions
   (architectural tick style), optional cut-list table, and title block.

## Getting started

```bash
npm install
npm run dev      # opens the app at http://localhost:5173
npm run build    # production build in dist/
```

## Modeling workflow (SketchUp-style)

1. **Draw a shape** — Rectangle (`R`), Circle (`C`), or Line (`L`) for any
   polygon. Draw on the ground plane, or hover over a face of an existing
   solid to draw directly on it (e.g., draw on a wall).
2. **Push/Pull** (`P`) — click the shape and move the mouse to extrude it into
   a 3D solid. Click the top of an existing solid to change its height.
3. **Refine** — Move (`M`), Rotate (`Q`), Erase (`E`).
4. **Annotate** — Dimension tool (`T`) snaps to corners and midpoints and
   places dimension callouts in the model.
5. **Document** — click **Drawing Sheet…** to generate plan, elevations, and
   isometric views at a true architectural scale (e.g., 1/4" = 1'-0") with a
   title block, then Print / Save as PDF for the customer.

### Exact dimensions — the Measurements box

Like SketchUp's VCB, just start typing while using a tool and press **Enter**:

| While…                  | Type                    | Result                     |
|-------------------------|-------------------------|----------------------------|
| Drawing a rectangle     | `4', 2'` or `48,24`     | Exact width × height       |
| Drawing a circle        | `12` or `1'`            | Exact radius               |
| Push/pulling            | `30` or `2' 6"`         | Exact depth/height         |
| Moving                  | `18`                    | Exact move distance        |
| Rotating                | `45`                    | Exact angle in degrees     |

Accepted formats: `3' 6"`, `3'6 1/2"`, `42`, `42"`, `3.5'`, `1200mm`, `30cm`, `1.2m`.
Display units are switchable (Feet & Inches / Decimal Inches / Millimeters)
in the status bar.

## Keyboard shortcuts

| Key      | Tool / Action        |
|----------|----------------------|
| `Space`  | Select (Shift+click = multi-select) |
| `L`      | Line (closed shapes) |
| `R`      | Rectangle            |
| `C`      | Circle               |
| `P`      | Push/Pull            |
| `I`      | Steel / stock member library |
| `B`      | Railing designer     |
| `Ctrl+K` | Command palette      |
| `M`      | Move (Shift = vertical, Ctrl = copy, then `x4` = array) |
| `Q`      | Rotate               |
| `T`      | Dimension            |
| `E`      | Eraser               |
| `Delete` | Delete selection     |
| `Esc`    | Cancel current action|
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste selection |
| `Ctrl+S` | Save project         |
| `Shift+Z`| Zoom to fit          |

**Navigation:** middle-drag orbits, right-drag pans, scroll wheel zooms.
Toolbar buttons switch to standard Iso / Top / Front / Right views.

## Features

- **Structural steel library** — parametric angle, channel, W-beam, HSS tube,
  pipe, flat bar, round bar, and plate with standard catalog sizes.
- **Cut list / BOM** — live grouping with per-part and total weights from real
  material densities; CSV export; printable on drawing sheets.
- **Materials** — steel, stainless, aluminum, wood, plywood, concrete; drives
  both appearance (PBR metals) and weight math.
- **Snapping & inference** — corner and midpoint snaps (green), automatic axis
  inference (red/green/blue dashed guides), configurable grid snap, and a
  full locking system:
  - **Hold Shift** locks your current direction — the nearest axis, or the
    exact free direction you're heading (magenta) for sloped/edge-aligned work
  - **Arrow keys** toggle sticky axis locks: `→` red (X), `←` blue (Z),
    `↑` green (vertical) — press again or Esc to release
  - While locked, hovering another corner projects it onto the locked line
    (draw a wall exactly as long as an existing one, square to the building)
- **Learn-by-doing** — first-visit quick-start banner, a Help center (`H`)
  with a 60-second tutorial and full shortcut reference, and a built-in
  example project (a complete welding workbench with named parts, materials,
  dimensions, and a live cut list). Double-click closes Line shapes.
- **Multi-select, copy, paste, array** — production-speed editing.
- **Layers** — organize work (e.g., Existing / New / Dimensions), per-layer
  color and visibility.
- **Entity info** — editable part name & material, live size, section area,
  and weight of the selection.
- **Drawing sheets** — orthographic plan/elevation views rendered in
  hidden-line style at true scale (3" = 1'-0" down to 1/8" = 1'-0") on
  Letter, Tabloid, or Arch D sheets, with automatic overall dimensions and a
  professional title block.
- **DXF export** — flat part profiles for plasma/laser/waterjet cutting.
- **Project files** — save/open as portable `.cadshop.json` files.
- **STL export** — hand geometry to CNC/3D-print workflows.
- **Undo/redo** — full history of every modeling step.

## Project structure

```
src/
  core/       viewport (camera/renderer), model (entities + serialization),
              snapping engine, undo history, units, rubber-band preview
  tools/      select, line, rect, circle, push/pull, move, rotate,
              dimension, eraser
  ui/         toolbar, layers & entity panels, sheet dialog
  drawing/    orthographic view renderer + printable sheet generator
```

The document model is simple and portable: every solid is a 2D profile on a
plane plus an extrusion depth and an optional transform, so files stay small
and geometry stays editable.
