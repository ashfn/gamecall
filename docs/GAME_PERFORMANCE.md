# Game performance contract

Rainfrog games target the display's native refresh rate: 120 Hz on capable
devices and a locked 60 Hz on older 60 Hz hardware. A 60 Hz panel cannot show
120 distinct frames, so the old-device target is zero avoidable frame drops,
not an artificial 120-FPS counter.

## Frame budgets

- 120 Hz: 8.33 ms total UI-frame budget.
- 60 Hz: 16.67 ms total UI-frame budget.
- A gesture or playback loop must not call a React state setter per frame.
- Network requests, persistence, dictionary checks, and authoritative outcome
  checks never run in the animation critical path.
- Animate `transform` and `opacity`. Do not animate layout (`left`, `top`,
  `width`, `height`, gaps, margins, or padding) for continuous interaction.
- Keep game state authoritative and serializable, but keep ephemeral gesture
  coordinates in UI-thread shared values or imperative native views.
- Mount stable render layers once. React should reconcile on semantic changes
  (turn, score, pocket, committed move), not visual interpolation frames.
- Avoid capturing large game objects in Reanimated worklets.
- If a scene needs more than roughly 100 independently animated native views
  on low-end Android, render it as a single canvas/Skia scene instead.

## Required profiling pass for every game

1. Use a release/internal build; development-mode timings are not acceptance
   data.
2. Test on a physical 60 Hz low-end/old device and a physical 120 Hz device.
3. Record JS and UI FPS while performing the worst interaction continuously
   for 30 seconds.
4. Profile the interaction in React Native DevTools and verify there are no
   repeated React commits during an otherwise purely visual drag/playback.
5. Test with a slow or disconnected network. Local interaction must remain
   smooth while persistence retries in the background.
6. Test maximum scene complexity, not an empty board.
7. Check memory before and after 20 consecutive games for retained scenes,
   timers, animation frames, and gesture closures.

## Current game architecture

- Word Drop pans and zooms the complete board with one compositor transform.
  Tile dragging stays on the UI thread and crosses to JS only when its logical
  rack slot or final drop result changes.
- 8 Ball mounts its balls once and updates their native position/SVG nodes
  imperatively during playback. React updates only for semantic events such as
  a newly potted ball or the end of a shot. Client and server continue to use
  byte-identical deterministic physics.

