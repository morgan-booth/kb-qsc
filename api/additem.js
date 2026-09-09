import { put } from '@vercel/blob';
import { workTypeOf } from './_worktype.js';

export const config = { maxDuration: 30 };

// A repair a manager spots between audits — a broken door handle on a Tuesday.
// Until now the only way onto the punch-list was to start an inspection.
//
// It's written as an audit record holding ONE item, deliberately:
//   - openitems, resolve, the overdue digest and the punch-list all read that
//     shape already, so close-out, photos, logs and Slack work untouched
//   - one item per blob means these never contend the way audit items do
//
// manual:true keeps it out of the report archive and out of the close-rate. A
// manager who logs problems honestly shouldn't score worse than one who doesn't.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    const store = String(b.store || '').trim();
    const item = String(b.item || '').trim();
    if (!store || !item) return res.status(400).json({ error: 'store and item required' });

    const mark = (b.mark === 'rep') ? 'rep' : 'attn';
    const now = new Date().toISOString();
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const sectionTitle = String(b.sectionTitle || 'Added by manager').trim();

    const rec = {
      id, manual: true,
      store, submittedBy: b.by || '', submittedAt: now, date: now.slice(0, 10),
      type: 'Added item', mode: 'manual', result: '—',
      items: [{
        section: b.section == null ? 99 : b.section,
        sectionTitle,
        item, mark,
        note: String(b.note || '').trim(),
        fixBy: b.fixBy || '',
        capital: !!b.capital,
        photos: Array.isArray(b.photos) ? b.photos : [],
        materials: '',
        log: [{ at: now, by: b.by || '', text: 'Added by ' + (b.by || 'a manager') }]
      }]
    };
    rec.items[0].workTypeAuto = workTypeOf(rec.items[0]);

    await put('audits/' + id + '.json', JSON.stringify(rec), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
    });
    res.status(200).json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
