import { list, put } from '@vercel/blob';

export const config = { maxDuration: 30 };

// Corporate override: release a held submission. GET/POST ?id=&by=
export default async function handler(req, res) {
  try {
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    const by = (req.query && req.query.by) || (req.body && req.body.by) || '';
    if (!id) return res.status(400).json({ error: 'missing id' });
    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(404).json({ error: 'not found' });
    const rec = await (await fetch(found.blobs[0].url)).json();
    rec.verification = 'override';
    rec.overrideBy = by;
    rec.overrideAt = new Date().toISOString();
    await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
    res.status(200).json({ ok: true, verification: 'override', overrideBy: by });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
