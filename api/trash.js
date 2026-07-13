import { list } from '@vercel/blob';

// List soft-deleted reports (Recently deleted), most-recent first.
export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'audits/' });
    const items = await Promise.all(blobs.map(async b => { try { return await (await fetch(b.url)).json(); } catch (e) { return null; } }));
    let out = items.filter(Boolean).filter(r => r.deleted).map(r => ({
      id: r.id, store: r.store, type: r.type, submittedBy: r.submittedBy, date: r.date,
      result: r.result, color: r.color, submittedAt: r.submittedAt, deletedAt: r.deletedAt,
      incomplete: r.incomplete, mode: r.mode, spotTitles: r.spotTitles
    }));
    out.sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
    res.status(200).json(out.slice(0, 40));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
