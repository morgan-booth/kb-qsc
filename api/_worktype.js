// What KIND of work a punch-list flag is, so a manager can hand one trade's list
// to one crew. Derived from the flag, NOT the fixture: "Three-Comp Sink" is
// cleaning when the note says "front of compartments" and plumbing when it says
// "new faucet".
//
// The note is the whole signal when there is one. Fixture names are compound
// inspection headings — "Floors / Cove Base / Drains" — so a single word in them
// hijacks the result ("drains" made "toilet paper on floor" plumbing). They are
// consulted ONLY when the note is blank.
//
// Cleaning is tested last because it is the catch-all; the specific trades get
// first refusal on a note that mentions one of them.
export const WORK_TYPES = ['Cleaning', 'Repair', 'Equipment', 'Plumbing', 'Paint', 'Grounds', 'Organize', 'Signage', 'Admin'];

const NOTE_RULES = [
  ['Plumbing',  /faucet|leak|clog|water line|p-?trap|urinal|\bpipe|toilet (?!paper)|backing up|back ?flow|grease trap/],
  ['Equipment', /gasket|casket|compressor|thermostat|burner|pilot|motor|belt|bearing|not working|won'?t |quit|broken|blown|no heat|won'?t hold/],
  ['Paint',     /\bpaint|striping|re-?stain|touch ?up/],
  ['Grounds',   /weed|landscap|pot ?hole|asphalt|curb|mow|shrub/],
  ['Signage',   /\bsign\b|poster|menu board|decal|lettering/],
  ['Organize',  /organiz|placement|items on floor|label|rotat|shelving placement/],
  ['Cleaning',  /clean|wipe|scrub|polish|dirty|stain|spill|build ?up|dust|debris|mop|sweep|degrease|sanitiz|floor|trash|paper|wash|empty|residue|grime|grease/],
];
// Only consulted when the note is blank.
const ITEM_RULES = [
  ['Grounds',   /parking|lot striping|dumpster|landscap/],
  ['Signage',   /poster|signage/],
  ['Plumbing',  /three-?comp|hand sink|grease trap/],
];

export function workTypeOf(it) {
  const note = String(it.note || '').toLowerCase().trim();
  const item = String(it.item || '').toLowerCase();
  if (note) {
    for (const [name, re] of NOTE_RULES) if (re.test(note)) return name;
  } else {
    for (const [name, re] of ITEM_RULES) if (re.test(item)) return name;
  }
  // Nothing said otherwise: a repair flag is a repair, anything else is cleaning.
  return it.mark === 'rep' ? 'Repair' : 'Cleaning';
}

// One person, one spelling: "  jose  " and "JOSE" are the same assignee.
export function normName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
    .replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
