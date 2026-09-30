// The 12 QSC sections, by number and title.
//
// kb-qsc-form.html owns the real definition — every item, photo rule and weight.
// This is only what the reminders need: a number to link to and a name to say out
// loud in Slack. If a section is renamed or renumbered in the form, change it here
// too, or a reminder will name a section that no longer exists.
export const SECTIONS = [
  { n: 1,  title: 'Exterior Image' },
  { n: 2,  title: "Restrooms — Men's" },
  { n: 3,  title: "Restrooms — Women's" },
  { n: 4,  title: 'Dining Room' },
  { n: 5,  title: 'Server Station 1' },
  { n: 6,  title: 'Server Station 2' },
  { n: 7,  title: 'Salad Wagon' },
  { n: 8,  title: 'Team & Image' },
  { n: 9,  title: 'Bar & Lounge' },
  { n: 10, title: 'Patio' },
  { n: 11, title: 'Kitchen & BOH' },
  { n: 12, title: 'Health Dept Readiness' },
];

export const titleOf = n => (SECTIONS.find(s => s.n === n) || {}).title || ('Section ' + n);

// The order spot checks walk the building in. Deliberately not 1-2-3: each pair
// sends the manager to one room out front and one out back, so a spot check is a
// lap of the restaurant rather than two looks at the same corner. Two sections a
// time through this list covers all twelve in six checks — about three weeks at
// twice a week.
export const SPOT_ROTATION = [1, 11, 4, 12, 2, 9, 3, 7, 5, 8, 6, 10];
