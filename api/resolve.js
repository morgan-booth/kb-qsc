import { list, put } from '@vercel/blob';

export const config = { maxDuration: 30 };

// Mark a punch-list item fixed (or reopen it). Writes the close-out back onto the
// audit record's item: resolved, resolvedAt, resolvedBy, afterPhotos, resolveNote.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const { id, section, item, resolvedBy, afterPhotos, note, reopen } = req.body || {};
    if (!id || section == null || !item) return res.status(400).json({ error: 'missing id/section/item' });
    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(404).json({ error: 'audit not found' });
    const rec = await (await fetch(found.blobs[0].url)).json();
    const it = (rec.items || []).find(x => String(x.section) === String(section) && x.item === item);
    if (!it) return res.status(404).json({ error: 'item not found' });
    if (reopen) {
      it.resolved = false; delete it.resolvedAt; delete it.resolvedBy; delete it.afterPhotos; delete it.resolveNote;
    } else {
      it.resolved = true;
      it.resolvedAt = new Date().toISOString();
      it.resolvedBy = resolvedBy || '';
      it.afterPhotos = Array.isArray(afterPhotos) ? afterPhotos : [];
      it.resolveNote = note || '';
    }
    await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
