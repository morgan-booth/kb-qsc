import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';

export const config = { maxDuration: 30 };

// Soft-delete a report by id (?id=). Flags it deleted instead of removing it,
// so it can be restored from "Recently deleted". Nothing is permanently lost.
export default async function handler(req, res) {
  try {
    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'missing id' });
    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(200).json({ ok: true, deleted: 0 });
    const rec = await readBlob(found.blobs[0].url);
    rec.deleted = true;
    rec.deletedAt = new Date().toISOString();
    await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    res.status(200).json({ ok: true, deleted: 1 });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
