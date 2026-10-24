# The Room Is Weird

A small, self-contained Three.js first-person puzzle game set in a cheerful living room where the remote changes gravity.

## Run it

Requires Node.js 20.19+ (or 22.12+) and pnpm 10.

From the workspace root:

```bash
pnpm install
pnpm --filter @workspace/the-room-is-weird run dev
```

For a production build:

```bash
pnpm --filter @workspace/the-room-is-weird run build
```

## Controls

- **W A S D** or **arrow keys** — move
- **Mouse** — look around. Click an empty part of the scene to capture the mouse; press **Escape** to release it and pause.
- **E** — interact with the object under the crosshair
- **Click** an object — interact without mouse capture
- **Remote button** — use the remote after picking it up
- **Need a hint?** — show an optional puzzle hint

The game can also be played on touch screens with the on-screen movement controls.

## Puzzle

Pick up the unusual remote on the coffee table, use it to flip the room, find and activate the newly revealed switch, then interact with the exit. The switch and door give clear feedback if tried too early. Opening the door completes the level and reveals the ending; replay starts the puzzle over.

## Architecture

- `src/game/RoomScene.tsx` — procedural Three.js room, camera, first-person movement, collisions, object raycasting, room transformation, and scene animation.
- `src/game/puzzle.ts` — progression state, interaction messages, objectives, and optional hints.
- `src/game/audio.ts` — Web Audio ambience and synthesized interaction effects; no audio assets or network requests.
- `src/App.tsx` — title, settings, pause, interaction HUD, puzzle progress, and completion/replay screens.

All essential models, materials, gameplay logic, and sound are generated locally. The project does not use a backend, external models, or paid services.

## Known limitations

- This is a single-level vertical slice rather than a full-length game.
- The art and sound are procedural. The room is deliberately stylized and uses lightweight geometry instead of imported character or furniture models.
- Interactions are forgiving and use the crosshair/object target rather than requiring precise reach or physics simulation.
- The mouse is captured only after clicking the scene; browser audio begins after the Play button, as required by browser interaction policies.
