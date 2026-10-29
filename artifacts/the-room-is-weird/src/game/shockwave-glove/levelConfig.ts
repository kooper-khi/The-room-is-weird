// All the tunable numbers for the Shockwave Glove level live here.
// World layout (metres). The player walks along -Z the whole level:
//   Containment Bay (z +7 .. -7)  ->  door  ->  Tunnel (z -7.5 .. -37)  ->  Arena (centre z -66, radius 30)

export const BASE_URL: string =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export const MODEL_URLS = {
  glove: `${BASE_URL}shockwave-glove/models/glove.glb`,
  hero: `${BASE_URL}shockwave-glove/models/hero.glb`,
  rival: `${BASE_URL}shockwave-glove/models/rival.glb`,
};

export const CFG = {
  eyeHeight: 1.65,
  walkSpeed: 4.4,
  playerRadius: 0.36,
  interactDistance: 3.8,
  interactCone: 0.93, // cosine of the look-at tolerance

  cell: { halfW: 7, halfD: 7, height: 4.6, spawn: { x: 0, z: 5.4 }, doorHalf: 1.75, doorZ: -7.25, doorHeight: 3.4 },
  bench: { x: 4.8, z: -3.6, topY: 0.95 },
  tunnel: { zStart: -7.5, zEnd: -37.2, halfW: 2.3, height: 3.8 },
  arena: { cx: 0, cz: -66, radius: 30, wallHeight: 12 },

  // Walking past this Z starts the duel cutscene.
  duelTriggerZ: -47,
  hero: { x: 0, z: -54 },
  rival: { x: 0, z: -70 },

  // The three glove fragments. y is the hover height of the pickup.
  fragments: [
    { id: 'core', node: 'part_core', label: 'Shockwave Core', hint: 'high shelf, west wall', x: -6.25, y: 1.95, z: 1.3 },
    { id: 'plate', node: 'part_plate', label: 'Knuckle Plate', hint: 'crates, south-east corner', x: 5.2, y: 1.72, z: 5.4 },
    { id: 'cell', node: 'part_cell', label: 'Power Cell', hint: 'table, north-west corner', x: -5.2, y: 1.32, z: -5.6 },
  ],

  colors: {
    hero: '#38d8ff',
    rival: '#ff4a3a',
    amber: '#ffb14a',
  },
} as const;

export type FragmentId = (typeof CFG.fragments)[number]['id'];
