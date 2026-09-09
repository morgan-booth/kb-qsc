// What KIND of work a punch-list flag is, so a manager can hand one trade's list
// to one crew. Derived from the flag (item + note + mark), NOT from the fixture:
// "Three-Comp Sink" is cleaning when the note says "front of compartments" and
// plumbing when it says "new faucet". The note is the strongest signal, so it is
// tested first; the fixture name only breaks ties.
export const WORK_TYPES = ['Cleaning', 'Repair', 'Equipment', 'Plumbing', 'Paint', 'Grounds', 'Organize', 'Signage', 'Admin'];

const NOTE_RULES = [
  ['Cleaning',  /\bclean|wipe|scrub|polish|dirty|stain|spill|build ?up|dust|debris|mop|sweep|degrease|sanitiz/],
  ['Plumbing',  /faucet|leak|clog|water line|p-?trap|urinal|toilet (?!paper)|pipe|back(ing)? up/],
  ['Equipment', /gasket|casket|compressor|thermostat|burner|pilot|motor|belt|bearing|not working|won'?t |quit|broken|blown/],
  ['Paint',     /\bpaint|striping|re-?stain/],
  ['Grounds',   /weed|landscap|pot ?hole|asphalt|curb|mow/],
  ['Signage',   /\bsign\b|poster|menu board|decal|lettering/],
  ['Organize',  /organiz|placement|items on floor|label|rotat|shelv/],
];
const ITEM_RULES = [
  ['Plumbing',  /sink|drain|toilet|urinal|faucet|grease trap/],
  ['Grounds',   /parking|lot |dumpster|landscap|exterior/],
  ['Signage',   /sign|poster/],
];

// mark 'rep' means the manager already said this needs fixing, not cleaning.
export function workTypeOf(it) {
  const note = String(it.note || '').toLowerCase();
  const item = String(it.item || '').toLowerCase();
  for (const [name, re] of NOTE_RULES) if (re.test(note)) return name;
  for (const [name, re] of ITEM_RULES) if (re.test(item)) return name;
  return it.mark === 'rep' ? 'Repair' : 'Cleaning';
}

// One person, one spelling: "  jose  " and "JOSE" are the same assignee.
export function normName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim()
    .replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
