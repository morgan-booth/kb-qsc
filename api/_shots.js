// Named proof shots, per section.
//
// "Add photo x4" gets you four easy photos. Four exterior shots came back as a wide
// parking lot, the flags against the sky, and one good one of the grease bin — one
// in four was evidence. Naming the shot is what turns a photo into proof, and it is
// also what makes two visits, or two stores, comparable at all.
//
// Every shot below names a surface that does not get cleaned unless somebody looks:
// undersides, wheels, thresholds, the wall-to-floor junction, the corner away from
// the door. The front of a fryer proves nothing; the floor behind it is the question.
//
// Lists are deliberately uneven. Kitchen & BOH has drawn 60 flags on record and
// carries 11 shots; Team & Image has drawn 4 and carries 2. Health Dept Readiness
// asks for none — that section records temperatures and readings as numbers, which
// is its own proof.
//
// `core: true` marks the shots that lead the rotation, chosen on flag history.
// Source of truth for the wording is docs/shot-lists.md.
export const SHOTS = {
  1: [ // Exterior Image — 26 flags
    { label: 'Grease bin — lid open, and the pad underneath it', core: true },
    { label: 'Back door area — threshold, bottom of the door, ground outside it', core: true },
    { label: 'Dumpster corral — gate, inside walls, ground around the base', core: true },
    { label: 'Front entry — glass, door track and kick plate, shot low' },
    { label: 'Parking lot — the far corner, away from the door' },
    { label: 'Building base — where the wall meets the pavement, one full wall' },
    { label: 'Signage and flags — close enough to judge condition, not against the sky' },
  ],
  2: [ // Restrooms — Men's — 12 flags
    { label: 'Floor at the base of the toilets and urinals, including behind them', core: true },
    { label: 'Cove base along the full wall, low angle', core: true },
    { label: 'Partition panel — bottom edge and both faces of one panel', core: true },
    { label: 'Under the sink — trap, and the wall behind the faucet' },
    { label: 'Light lens from directly below' },
    { label: 'Baby changing station — open, both surfaces' },
    { label: 'Dispensers open — soap, towels, TP, showing stock' },
  ],
  3: [ // Restrooms — Women's — 16 flags
    { label: 'Trash bins inside the stalls — lid, liner, and the floor beside them', core: true },
    { label: 'Floor at the base of both toilets, including behind', core: true },
    { label: 'Cove base along the full wall, low angle', core: true },
    { label: 'Partition panel — bottom edge and both faces of one panel' },
    { label: 'Under the sink — trap, and the wall behind the faucet' },
    { label: 'Light lens from directly below' },
    { label: 'Baby changing station — open, both surfaces' },
    { label: 'Dispensers open — soap, towels, TP, showing stock' },
  ],
  4: [ // Dining Room — 21 flags
    { label: 'Chair legs and feet — one full row, low angle', core: true },
    { label: 'Floor and cove base under a booth', core: true },
    { label: 'Under one table — the underside and the pedestal', core: true },
    { label: 'Window ledges — low angle down the sill' },
    { label: 'Ceiling vents and fan blades' },
    { label: 'High chairs — seat, straps, underside' },
    { label: 'Entry mats lifted, and the floor beneath them' },
  ],
  5: [ // Server Station 1 — 19 flags
    { label: 'Roll warmer interior — door open, including the bottom pan', core: true },
    { label: 'Drink dispenser nozzles, close, from below', core: true },
    { label: 'Drip tray lifted out, and the counter under it', core: true },
    { label: 'Floor drain — cover off, or close enough to see inside' },
    { label: 'Coffee machine sprayhead and the tray beneath' },
    { label: 'Hand sink — soap, towels, and the floor underneath' },
    { label: 'Ceiling tiles and light lens above the station' },
  ],
  6: [ // Server Station 2 — 14 flags
    { label: 'Drink dispenser nozzles, close, from below', core: true },
    { label: 'Drip tray lifted out, and the counter under it', core: true },
    { label: 'Floor drain — cover off, or close enough to see inside', core: true },
    { label: 'Counters and mats lifted — the surface beneath' },
    { label: 'Coffee machine sprayhead and the tray beneath' },
    { label: 'Hand sink — soap, towels, and the floor underneath' },
  ],
  7: [ // Salad Wagon — 8 flags
    { label: 'Wagon wheels and the floor beneath the wagon', core: true },
    { label: 'Plate chiller interior, lid open', core: true },
    { label: 'Glass top edges and the track it sits in', core: true },
    { label: 'Soup and beans wells — the rim and the surround' },
    { label: 'Labels on prepped product, close enough to read the dates' },
    { label: 'White top area, including the corners' },
  ],
  8: [ // Team & Image — 4 flags. A line-up is a roll call, not a candid: everyone
       // knows the photo is being taken and why. That is the difference between a
       // uniform check and surveillance, and it is why there is no third shot here.
    { label: 'BOH team, lined up', core: true },
    { label: 'FOH team, lined up', core: true },
  ],
  9: [ // Bar & Lounge — 18 flags
    { label: 'Three-comp sink — all three basins and the drainboard', core: true },
    { label: 'Bar mats lifted, and the surface beneath them', core: true },
    { label: 'Bottle cooler interior, including the bottom', core: true },
    { label: 'Keg cooler — floor and the lines' },
    { label: 'Glass chiller interior' },
    { label: 'Floor behind the bar, along the mat line' },
    { label: 'Required posters, readable' },
  ],
  10: [ // Patio — 14 flags. Floors / Steps is the most-flagged item on record.
    { label: 'Steps — treads and the nosing, low angle', core: true },
    { label: 'Floor along the wall base and into the corners', core: true },
    { label: 'Table and chair legs and feet', core: true },
    { label: 'Gate — hinges, latch, bottom rail' },
    { label: 'Ash trays, contents visible' },
    { label: 'Posts and walls at ground level' },
  ],
  11: [ // Kitchen & BOH — 60 flags, double the next section
    { label: 'Under and behind the fryers — floor and wall', core: true },
    { label: 'Flat top — sides, back splash, and the grease trough', core: true },
    { label: 'BOH floor at a wall junction, low angle', core: true },
    { label: 'Fryer freezer interior — racks and the lid gasket' },
    { label: 'Charbroiler / low boy — the floor beneath the unit' },
    { label: 'Bread rack — rails and wheels' },
    { label: 'Ice machine — interior lid, and the floor beneath it' },
    { label: 'Walk-in cooler — fan guards, and the floor in the corners' },
    { label: 'Dish machine — interior, screens, and the shelving beside it' },
    { label: 'Back door threshold, from inside' },
    { label: 'Dry storage — the bottom shelf and the floor under it' },
  ],
  12: [],   // Health Dept Readiness — readings, not surfaces. No photos by design.
};

export const SHOTS_PER_VISIT = 3;

// Week zero of the rotation: the Thursday named shots went live. Shifting this
// re-phases every section at once, which is a thing to do deliberately and
// probably never.
const ROTATION_ANCHOR = Date.UTC(2026, 10, 5);   // 2026-11-05

// Which shots this visit asks for.
//
// Rotating matters as much as naming: asking for all eleven kitchen shots every time
// is the administrative burden we are trying to avoid, and asking the same three
// forever can be pre-staged. Three a visit, moving through the list, keeps the ask
// small and the next one unpredictable.
//
// Derived from the date rather than stored, so the reminder, the form and the review
// all compute the same answer with nothing to keep in sync.
export function shotsFor(section, isoDate, perVisit) {
  const all = SHOTS[section] || [];
  if (!all.length) return [];
  const want = Math.min(perVisit || SHOTS_PER_VISIT, all.length);
  // Core shots lead, the rest follow in list order.
  const ordered = all.filter(s => s.core).concat(all.filter(s => !s.core));
  // Anchored, not keyed off the absolute week number, so the FIRST visit asks the
  // core shots rather than landing wherever the epoch happens to put it.
  const t = Date.parse(String(isoDate || '') + 'T00:00:00Z');
  const week = isNaN(t) ? 0 : Math.floor((t - ROTATION_ANCHOR) / 604800000);
  const offset = ((week * want) % ordered.length + ordered.length) % ordered.length;
  const out = [];
  for (let i = 0; i < want; i++) out.push(ordered[(offset + i) % ordered.length]);
  return out.map((s, i) => ({ slot: i, label: s.label, core: !!s.core }));
}
