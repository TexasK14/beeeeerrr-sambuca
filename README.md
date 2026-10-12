# Fire & Ice — beer + sambuca 3D edit

15-second vertical (1080×1920, 30 fps, 450 frames) TikTok-style 3D edit rendered with
[Remotion](https://www.remotion.dev) + `@remotion/three` (React Three Fiber) and `postprocessing`.

## Run

```bash
npm install
npm run studio                       # live preview
npm run stills                       # preview stills -> out/stills/
npm run stills -- 30 115 294         # specific frames
npm run render                       # full MP4 -> out/beer-sambuca-edit.mp4
```

No GPU / no Remotion browser download? Point at any Chromium headless shell:
`REMOTION_BROWSER=/path/to/headless_shell npm run render` (WebGL uses SwiftShader via `swangle`).

## How it's built

- `src/timeline.ts` — the edit. 120 BPM grid (1 beat = 15 frames). Each shot maps real frames to
  **story time**, camera and FX (flash, shake, zoom punch, chromatic aberration, whip-pan, bloom, freeze, fade).
  Slow-mo / speed ramps / montage jump-backs / freeze frame are just different story-time mappings.
- `src/scene/Objects.tsx` — bottles, pint, shot glass, liquid levels, bubbles, foam, beans. All pure functions of story time.
- `src/scene/parts.tsx` — fake pour stream (ballistic tube with travelling wobble), splashes, condensation droplets + drips, mist, backdrop/bokeh.
- `src/scene/Flame.tsx` — fbm shader flame on billboards + blue point light.
- `src/scene/Scene.tsx` — lights, studio env map, post stack (DoF → bloom → CA → ACES, contrast, grain, vignette).
- `src/Edit.tsx` — 2D layer: zoom punch, directional whip blur, flash frames, "FIRE & ICE" title, fade.

| Time | Beat | Shot |
|---|---|---|
| 0–2s | 0–4 | macro push-in across both bottles |
| 2–3s | 4–6 | cap pop: flash + shake on beat 4 |
| 3–6s | 6–12 | beer pour, low angle, slow-mo → speed snap on beat 9 |
| 6–8s | 12–16 | sambuca pour slow-mo, beans land on beats 13/14/15 |
| 8–10s | 16–20 | montage: bubbles / foam / beans / ignite + whip-pan |
| 10–13s | 20–26 | hero orbit, bloom peak |
| 13–15s | 26–30 | zoom punch, freeze, FIRE & ICE slam (beat 27), fade |

Labels are generic (no real brands). Anton font is bundled under the SIL Open Font License.
