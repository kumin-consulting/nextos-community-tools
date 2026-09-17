# Sketch

An infinite whiteboard for NextOS. Draw a diagram, think out loud on a
canvas that never runs out of room, and take the result away as a clean
SVG or a PNG. It is the kind of tool people reach for when a paragraph
would take longer than a picture: flowcharts, architecture sketches,
retro boards, wireframes, the shape of an argument.

Everything is local. A board is one JSON file in your `Sketches` folder,
Sketch autosaves as you draw, and nothing it does needs the network.

## The canvas

Pan with space and drag, the middle mouse button, or two fingers on a
trackpad. Zoom to the cursor with ⌘/Ctrl and the wheel, or pinch. `⇧1`
fits the whole board, `⇧2` fits the selection, `⌘0` goes back to 100%.
A minimap in the corner shows where you are; click it to jump. The
background is a grid, dots or plain paper - press `G` to cycle.

The canvas is a single `<canvas>` with a retained element model: it culls
to the visible rectangle and redraws only when something actually
changed, so panning a board of a couple of thousand elements stays at 60
frames a second.

## Tools

| Key | Tool | |
| --- | --- | --- |
| `V` `1` | Select | click, shift-click, or drag a marquee |
| `H` `2` | Hand | or hold space with any tool |
| `R` `3` | Rectangle | shift for a square |
| `D` `4` | Diamond | |
| `O` `5` | Ellipse | |
| `A` `6` | Arrow | binds to the shapes it touches |
| `L` `7` | Line | |
| `P` `8` | Draw | freehand, simplified as you go |
| `T` `9` | Text | |
| `N` `0` | Sticky note | opens ready to type |
| `F` | Frame | a named region that carries its contents |
| `E` | Eraser | drag across what you want gone |
| `/` | Shape library | flowchart start/end, process, decision, database, cloud, person |

Double-click a tool to keep it after drawing instead of falling back to
Select.

## Arrows that stay attached

Draw an arrow from one shape to another and both ends bind to those
shapes. Move, resize or rotate either one and the arrow re-aims itself at
the shape's edge, keeping the gap you gave it - through undo, through a
reload, through a file you send someone else. Double-click an arrow to
put a label on its midpoint. Arrows can be straight, curved or elbowed,
with an arrow, a dot, a bar or nothing at either end.

## Text

Double-click anywhere for a text element; double-click a shape to put
text inside it, where it stays centred and wraps to the shape. Text comes
in four sizes, three families and three alignments, and resizing a text
element scales the type rather than re-wrapping it.

## Arranging

Select many things and align them (left, centre, right, top, middle,
bottom) or distribute them evenly. Group with `⌘G`, ungroup with `⌘⇧G`.
Move things through the z-order with `⌘[` and `⌘]` (add shift for all the
way). Flip with `⇧H` and `⇧V`, lock with `⌘⇧L`, duplicate with `⌘D` or by
alt-dragging. Arrow keys nudge by a point, shift-arrow by ten. Dragging
snaps to the edges and centres of everything else on the board, and to the
grid; `⇧S` turns that off.

Undo and redo are coalesced: one drag, one slider run or one burst of
typing is one step.

## Frames

A frame is a named region. Anything centred inside it moves when the
frame moves, and a frame can be exported on its own - which is how you
get one diagram out of a board holding six.

## Files

Boards live in `<home>/Sketches/<name>.sketch.json`:

```json
{
  "type": "sketch",
  "version": 1,
  "name": "Checkout flow",
  "createdAt": "2026-09-17T09:12:00.000Z",
  "updatedAt": "2026-09-17T09:40:11.000Z",
  "background": "grid",
  "view": { "scrollX": -120, "scrollY": -80, "zoom": 1 },
  "elements": [
    { "id": "e1", "type": "rect", "x": 0, "y": 0, "w": 180, "h": 90, "text": "Take payment", "fill": "#d6e6fb", "fillStyle": "solid" },
    { "id": "e2", "type": "arrow", "x": 180, "y": 45, "points": [[0, 0], [120, 0]], "endArrow": "arrow", "startBinding": { "elementId": "e1", "gap": 6 } }
  ]
}
```

`⌘O` opens the board switcher: every board newest first, search, rename,
duplicate, delete, and import of a `.sketch.json` from elsewhere. `⌘N`
starts a new one. Saving is automatic - a debounced write that flushes
when the window loses focus - and the indicator by the name says
`Saving…` or `Saved`. `⌘S` flushes it now if you want to be sure.

If a file cannot be read, Sketch says exactly what is wrong with it,
leaves it untouched on disk, and offers to start a fresh copy. If one
element inside an otherwise valid file is unreadable, that element is
dropped and counted rather than costing you the board.

## Export

`⌘E` opens the export sheet: the whole board, just the selection, or one
frame; PNG at 1x or 2x, or SVG; with or without the paper colour; with a
live preview of the exact bytes you will get. Copy to the clipboard where
the browser allows it, or download the file.

The SVG is a real SVG. A rectangle leaves as `<rect>`, an ellipse as
`<ellipse>`, a diamond as `<polygon>`, freehand and curves as `<path>`,
and text as `<text>` with one `<tspan>` per line - so it opens in Figma,
Illustrator or Inkscape as editable objects and its words stay
selectable, searchable and translatable.

## Tools for agents

Sketch exposes five tools, so an assistant can build and read boards.

| Tool | What it does |
| --- | --- |
| `sketch_list_documents` | Every board, newest first, with the name to pass to the other tools. Read-only. |
| `sketch_create_diagram` | Takes a name and a graph - `{ nodes: [{ id, label, shape? }], edges: [{ from, to, label? }], direction?: "TB" \| "LR" }` - lays it out in layers, draws the shapes, connects them with bound arrows, saves the board and opens it. |
| `sketch_add_elements` | Appends elements to a board, the open one by default. |
| `sketch_export_svg` | Returns a board as SVG text. Read-only. |
| `sketch_describe` | Reads a board back in plain words: every shape with its label and position, every arrow with what it connects. Read-only. |

`sketch_create_diagram` uses a layered (Sugiyama-style) layout: cycles are
broken, nodes are assigned to layers, the ordering within each layer is
swept to reduce crossings, and an edge that skips a layer is routed
around whatever it skips instead of being drawn through it. Ask for
"a flowchart of our checkout, with a retry loop" and what comes back is
a board you can then drag about, because every arrow is genuinely
attached.

Sketch also answers one intent: `kumin://sketch/open?file=<board name or
path>`.

## Keyboard

Press `?` for the full sheet. Everything in the app has a key, every
control is reachable by Tab, and dialogs trap focus and return it when
they close.

## Permissions

| Permission | Why |
| --- | --- |
| `fs:read:home`, `fs:write:home` | Boards live in your `Sketches` folder |
| `storage` | Remembers your last colours, the snapping toggle and recent boards |
| `clipboard` | "Copy" in the export sheet |
| `intents` | Answers `kumin://sketch/open` |

No network permission: Sketch cannot phone anywhere, and does not want to.

## Limits, honestly

- One person at a time. There is no multiplayer cursor and no sync
  service; a board is a file you can send, not a session you can join.
- No images. You cannot paste a screenshot onto the canvas yet.
- Freehand is a single-width stroke: no pressure, no calligraphic pen.
- The diagram layout is built for the size of graph a person describes in
  a sentence - tens of nodes, not thousands.
- Copy and paste move elements between boards inside Sketch. Pasting a
  shape into another application means exporting it first.

## Building it

```
npm run build:app -- sketch     # the bundle, the zip and the lock file
npm run typecheck:apps          # type-checks src against @kumin/sdk
npm run test:apps               # the pure-logic tests in app/test
node tools/sketch/app/preview/serve.mjs   # the app in a plain browser tab
```

The preview harness at `app/preview/` runs the built bundle against a stub
SDK - an in-memory VFS, localStorage and the browser's colour-scheme
preference - which is how the screenshots on this page were taken.

MIT licensed.
