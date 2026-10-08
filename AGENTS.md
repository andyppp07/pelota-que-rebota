# AGENTS.md

Single-page [p5.js](https://p5js.org/) sketch. The whole project is two tracked files:
`index.html` (page shell) and `sketch.js` (the sketch).

## Running

- Open `index.html` in a browser (double-click). There is **no** build, package manager,
  server, test runner, lint, or CI in this repo — don't add one unless asked.
- p5.js v2.3.4 and p5.sound are loaded from the jsDelivr CDN in `index.html`; there is no
  local `node_modules`. Rendering and audio require network access.
- Load order matters: p5.js → p5.sound → `sketch.js`. Keep it.
- Audio only starts after a user gesture (browser autoplay policy). `sketch.js` resumes it
  on a window `pointerdown` plus `mousePressed`/`touchStarted`, and shows a "click to
  activate" hint until then. Tone.js logs a harmless "AudioContext is suspended" warning
  before the first gesture.

## Sound (easy to get wrong)

- p5.js 2.x does **not** ship the old `addons/p5.sound.js`; that URL 404s and the v1 sound
  library is incompatible with p5 2.x. Use the separate `p5.sound` package:
  `https://cdn.jsdelivr.net/npm/p5.sound@0.2.0/dist/p5.sound.min.js` (bundles Tone.js).
- In p5.sound 0.2.x the oscillator is routed through an envelope rather than played
  directly: `osc.disconnect()` then `osc.connect(env)`, and `env.play()` takes **no**
  arguments (it triggers `attackRelease`). There is no `env.setRange()` / `env.play(osc)`.

## Particles / shapes (easy to get wrong)

- Five figures (heart, flower, ghost, vampire, sword) are **pre-rendered** into
  `p5.Graphics` buffers in `construirFormas()` (`formas[tipo][paleta]`), then each particle
  draws with a single `drawingContext.drawImage()` — not p5's `image()`. Do not switch to
  `push()`/`image()` per particle: that measured ~7-10x slower.
- The particle colors are **derived from the ball's color**: `repintarFormas()` rebuilds the
  palettes as `lerpColor(colorPelota, randomAccent, 0.22)` and repaints the buffers. It is
  called on every ball bounce (when `colorPelota` changes). It costs ~3-7 ms, acceptable
  because bounces aren't every frame.
- The fade uses `drawingContext.globalAlpha`, **not** `tint()`. p5's `tint()` does
  per-image pixel work and is very slow (it was the dominant cost).
- Shapes are built only from primitives (`circle`, `ellipse`, `triangle`, `quad`, `rect`).
  In p5 2.3.4, `beginShape()` + `bezierVertex()` throws
  `TypeError: Cannot read properties of undefined (reading 'position')` in the new shape
  pipeline — avoid it for these figures.
- Particles are emitted **along the mouse path**: `emitirPorMovimiento()` drops one particle
  per `DIST_EMISION` (12) px the cursor travels, so a stationary mouse emits nothing and the
  figures form a trail as the mouse advances — **no click needed**. A `ratonEnPantalla` flag
  (window `pointermove` / document `mouseleave`) gates it and resets the trail on leaving.
  A touch still emits a burst on `touchStarted` (touch has no hover). They **seek** the
  cursor (`VEL_SEGUIR`/`SUAVIZADO`, slowing on approach), live `VIDA_PARTICULA` (10 s), fade
  in the last 2 s, and bounce off the four edges. Capped at `MAX_PARTICULAS` (260).

## Code conventions

- `sketch.js` is a classic global-mode p5 sketch: `setup()` and `draw()` are defined on
  the global scope. It is a plain `<script>`, not an ES module — don't add `import`/`export`.
- Comments and user-facing text (`<title>`, `<h1>`) are in Spanish. Match that.
- Canvas is sized with `createCanvas(windowWidth, windowHeight)` and a `windowResized()`
  handler keeps it full-window. `index.html` carries a CSS reset (zero body margin, hidden
  overflow, borderless block canvas) so the canvas fills the viewport edge-to-edge.
- The page title is the `<h1 id="titulo">` in `index.html` (currently "Pelotita Loca"),
  fixed and centered at the top with `pointer-events: none` (so clicks still reach the
  canvas/window). The in-canvas hint is drawn near the bottom to avoid overlapping it.
- The background is a dark color chosen to contrast with the bright shapes and ball:
  `background(FONDO...)` with `FONDO = [16, 18, 31]`. Keep `index.html`'s CSS `body`
  background in sync (`#10121f`) so there is no flash before the canvas paints.
- The ball is drawn by `dibujarPelota()`: a `colorPelota` fill plus a polka-dot pattern
  (a central dot and a ring of 6) in a darkened shade of the same color.

## Verified current behavior (sketch.js)

- Gravity is a fixed `velY += 0.55` per frame; no frame-rate independence.
- The ball bounces off all four edges. `energiaRebote()` scales the normal velocity by
  `random(0.8, 1.08)`, so energy varies per hit, but is never allowed below `REBOTE_MIN`
  (11) — this keeps the ball bouncing hard and prevents the old decay-to-still behavior.
  Speed is clamped to `VEL_MAX` (30).
- On every bounce `cambiarAspecto()` runs: it picks a new `radio` (`RADIO_MIN`..`RADIO_MAX`),
  a new random color, and rotates the velocity by a random angle (±0.9 rad). The inward sign
  of the normal is re-asserted afterward so the ball never re-collides with the same wall.
  `posX`/`posY` are re-clamped so a grown ball stays inside the canvas.
- `sonar()` plays a melody: each bounce advances `notaIndex` through the pentatonic `ESCALA`
  (sometimes up an octave) and triggers `env.play()` at amplitude 0.9.
- Movement pauses while the cursor is within `radio` of the ball's center (hover stop).
