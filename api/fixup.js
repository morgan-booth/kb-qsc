import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';

export const config = { maxDuration: 30 };

// ONE-SHOT, DELETED IMMEDIATELY AFTER RUNNING.
//
// The cleaning review used to send work back. It sent two of Bryan's items back
// twice each; he re-cleaned and re-submitted both, and one then aged to overdue
// against his store. The policy has changed — nothing gets sent back now — so
// these two need to land where the new policy would have put them: closed, to
// his credit, with his photos intact.
//
// Hardcoded to exactly these two items so it cannot touch anything else.
// Silent by design: Morgan is telling Bryan himself, and a pair of close
// notices firing in the store channel would step on that.
const TARGETS = [
  { id: 'mtng17imnf3w',  section: 11, item: 'Fryer Freezer' },
  { id: 'mtlnouin3b7vw', section: 6,  item: 'Floors' },
];

export default async function handler(req, res) {
  try {
    const done = [];
    for (const t of TARGETS) {
      const found = await list({ prefix: 'audits/' + t.id + '.json' });
      if (!found.blobs.length) { done.push({ item: t.item, error: 'audit not found' }); continue; }
      const url = found.blobs[0].url;
      const rec = await readBlob(url);
      const it = (rec.items || []).find(x => String(x.section) === String(t.section) && x.item === t.item);
      if (!it) { done.push({ item: t.item, error: 'item not found' }); continue; }

      const before = { status: it.itemStatus, note: it.note, redo: it.redoReason || '' };
      const now = new Date().toISOString();

      it.resolved = true;
      it.itemStatus = 'done';
      it.resolvedAt = now;
      it.resolvedBy = it.submittedBy || 'Bryan';   // his work, his credit
      it.resolveNote = '';
      delete it.redoReason;
      delete it.secondLook;

      // An earlier version of the review wrote its own verdict into the note
      // field, so a machine's text now reads as the manager's. Take it back out.
      if (/^\s*\(Claude\)/i.test(String(it.note || ''))) it.note = '';

      if (!Array.isArray(it.log)) it.log = [];
      it.log.push({ at: now, by: 'Corporate', text: 'Closed — the review was wrong to send this back' });

      await put('audits/' + t.id + '.json', JSON.stringify(rec), {
        access: 'public', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
      });
      done.push({
        item: t.item, store: rec.store, was: before,
        now: { status: it.itemStatus, by: it.resolvedBy, note: it.note, photos: (it.afterPhotos || []).length }
      });
    }
    res.status(200).json({ ok: true, done });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
