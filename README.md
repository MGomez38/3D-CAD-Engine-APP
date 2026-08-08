# CADShop — 3D CAD for Shop & Architectural Drawings

A browser-based 3D CAD application with a SketchUp-style workflow, built for
producing **engineered shop drawings** and **architectural drawings** for
customers. Model in 3D, then generate scaled, title-blocked drawing sheets
ready to print or save as PDF.

Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/) —
no plugins, no backend, runs entirely in the browser.

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
| `Space`  | Select               |
| `L`      | Line (closed shapes) |
| `R`      | Rectangle            |
| `C`      | Circle               |
| `P`      | Push/Pull            |
| `M`      | Move (Shift = vertical) |
| `Q`      | Rotate               |
| `T`      | Dimension            |
| `E`      | Eraser               |
| `Delete` | Delete selection     |
| `Esc`    | Cancel current action|
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+S` | Save project         |
| `Shift+Z`| Zoom to fit          |

**Navigation:** middle-drag orbits, right-drag pans, scroll wheel zooms.
Toolbar buttons switch to standard Iso / Top / Front / Right views.

## Features

- **Snapping & inference** — corner and midpoint snaps (green), axis locking
  (red/green/blue dashed guides), 1" grid snap.
- **Layers** — organize work (e.g., Existing / New / Dimensions), per-layer
  color and visibility.
- **Entity info** — live size, base area, and volume (cu ft) of the selection.
- **Drawing sheets** — orthographic plan/elevation views rendered in
  hidden-line style at true scale (3" = 1'-0" down to 1/8" = 1'-0") on
  Letter, Tabloid, or Arch D sheets with a professional title block.
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
