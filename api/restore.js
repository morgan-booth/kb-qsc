import { list, put } from '@vercel/blob';

export const config = { maxDuration: 30 };

// Restore a soft-deleted report by id (?id=). Clears the deleted flag.
export default async function handler(req, res) {
  try {
    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'missing id' });
    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(200).json({ ok: false, error: 'not found' });
    const rec = await (await fetch(found.blobs[0].url)).json();
    delete rec.deleted;
    delete rec.deletedAt;
    await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
