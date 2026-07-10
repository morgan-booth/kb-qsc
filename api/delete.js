import { list, del } from '@vercel/blob';

export const config = { maxDuration: 30 };

// Delete a single report by id (?id=).
export default async function handler(req, res) {
  try {
    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ error: 'missing id' });
    const found = await list({ prefix: 'audits/' + id + '.json' });
    await Promise.all(found.blobs.map(b => del(b.url)));
    res.status(200).json({ ok: true, deleted: found.blobs.length });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
