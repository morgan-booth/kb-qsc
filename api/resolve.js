import { list, put } from '@vercel/blob';

export const config = { maxDuration: 30 };

// Update a punch-list item's lifecycle and progress log on the audit record.
// Actions: fix (done, photo), ordered (materials on the way), blocked (can't repair, reason),
//          log (progress note / call), clear (corporate close, no photo), reopen.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    const { id, section, item } = b;
    if (!id || section == null || !item) return res.status(400).json({ error: 'missing id/section/item' });
    const who = b.by || b.resolvedBy || '';
    const act = b.action || (b.reopen ? 'reopen' : 'fix');
    const photos = Array.isArray(b.photos) ? b.photos : (Array.isArray(b.afterPhotos) ? b.afterPhotos : []);
    const note = b.note || '';
    const reason = b.reason || note;

    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(404).json({ error: 'audit not found' });
    const rec = await (await fetch(found.blobs[0].url)).json();
    const it = (rec.items || []).find(x => String(x.section) === String(section) && x.item === item);
    if (!it) return res.status(404).json({ error: 'item not found' });

    if (!Array.isArray(it.log)) it.log = [];
    const now = new Date().toISOString();
    const logEntry = (text, extra) => { it.log.push(Object.assign({ at: now, by: who, text: text }, extra || {})); };

    if (act === 'reopen') {
      it.resolved = false; it.itemStatus = 'open';
      delete it.resolvedAt; delete it.resolvedBy; delete it.afterPhotos; delete it.resolveNote; delete it.blockedReason;
      logEntry('Reopened');
    } else if (act === 'ordered') {
      it.resolved = false; it.itemStatus = 'ordered';
      logEntry('Materials ordered', { note: note });
    } else if (act === 'blocked') {
      it.resolved = false; it.itemStatus = 'blocked'; it.blockedReason = reason;
      logEntry("Can't repair", { note: reason });
    } else if (act === 'log') {
      logEntry('Update', { note: note, photos: photos });
    } else if (act === 'clear') {
      it.resolved = true; it.itemStatus = 'done'; it.resolvedAt = now; it.resolvedBy = who; it.afterPhotos = []; it.resolveNote = 'Cleared by corporate (no update)';
      logEntry('Cleared by corporate');
    } else { // fix
      it.resolved = true; it.itemStatus = 'done'; it.resolvedAt = now; it.resolvedBy = who; it.afterPhotos = photos; it.resolveNote = note;
      logEntry('Fixed', { note: note, photos: photos });
    }

    await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    res.status(200).json({ ok: true, itemStatus: it.itemStatus, resolved: !!it.resolved });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
