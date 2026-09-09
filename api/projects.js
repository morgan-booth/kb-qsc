import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';

export const config = { maxDuration: 30 };

// Corporate project tickets — capital work that management tracks, whether or not
// a QSC ever flagged it ("enclose the bathroom area with a door").
//
// One blob PER TICKET, unlike audit items which all share their audit's file.
// That is on purpose: the shared file is what makes concurrent edits lose each
// other, and a project accumulates estimates and notes over weeks from several
// people. One file per ticket means two tickets never contend at all.
const STATUSES = ['proposed', 'approved', 'in_progress', 'done', 'declined'];
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = v => { const n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };

async function save(p) {
  await put('projects/' + p.id + '.json', JSON.stringify(p), {
    access: 'public', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
  });
  return p;
}
async function load(id) {
  const clean = String(id || '').replace(/[^a-z0-9]/gi, '');
  if (!clean) return null;
  const found = await list({ prefix: 'projects/' + clean + '.json' });
  if (!found.blobs.length) return null;
  return await readBlob(found.blobs[0].url);
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method === 'GET') {
      if (req.query && req.query.id) {
        const p = await load(req.query.id);
        return p ? res.status(200).json(p) : res.status(404).json({ error: 'not found' });
      }
      const { blobs } = await list({ prefix: 'projects/' });
      let all = await Promise.all(blobs.map(async b => { try { return await readBlob(b.url); } catch (e) { return null; } }));
      all = all.filter(Boolean).filter(p => !p.deleted);
      const store = req.query && req.query.store;
      if (store) all = all.filter(p => p.store === store);
      const rank = { proposed: 0, approved: 1, in_progress: 2, done: 3, declined: 4 };
      all.sort((a, b) => (rank[a.status] - rank[b.status]) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return res.status(200).json(all);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = req.body || {};
    const who = b.by || '';
    const now = new Date().toISOString();
    const act = b.action || 'create';

    if (act === 'create') {
      if (!b.title || !b.store) return res.status(400).json({ error: 'title and store required' });
      const p = {
        id: nid(), store: b.store, title: String(b.title).trim(), detail: String(b.detail || '').trim(),
        status: 'proposed', requestedBy: who, createdAt: now,
        targetDate: b.targetDate || '', photos: Array.isArray(b.photos) ? b.photos : [],
        estimates: [], log: [{ at: now, by: who, text: 'Created' }]
      };
      await save(p);
      return res.status(200).json({ ok: true, id: p.id, project: p });
    }

    const p = await load(b.id);
    if (!p) return res.status(404).json({ error: 'project not found' });
    if (!Array.isArray(p.log)) p.log = [];
    if (!Array.isArray(p.estimates)) p.estimates = [];

    if (act === 'estimate') {
      const amt = money(b.amount);
      if (!b.vendor && amt == null) return res.status(400).json({ error: 'vendor or amount required' });
      const e = { id: nid(), vendor: String(b.vendor || '').trim(), amount: amt, note: String(b.note || '').trim(), by: who, at: now, photos: Array.isArray(b.photos) ? b.photos : [] };
      p.estimates.push(e);
      p.log.push({ at: now, by: who, text: 'Estimate added' + (e.vendor ? ' — ' + e.vendor : '') + (e.amount != null ? ' $' + e.amount.toLocaleString() : ''), photos: e.photos });
    } else if (act === 'note') {
      if (!b.note && !(b.photos || []).length) return res.status(400).json({ error: 'nothing to add' });
      p.log.push({ at: now, by: who, text: 'Update', note: String(b.note || '').trim(), photos: Array.isArray(b.photos) ? b.photos : [] });
    } else if (act === 'status') {
      if (STATUSES.indexOf(b.status) < 0) return res.status(400).json({ error: 'bad status' });
      const was = p.status; p.status = b.status;
      if (b.status === 'approved') { p.approvedBy = who; p.approvedAt = now; if (b.amount != null) p.approvedAmount = money(b.amount); }
      if (b.status === 'done') { p.closedBy = who; p.closedAt = now; if (b.amount != null) p.actualCost = money(b.amount); }
      p.log.push({ at: now, by: who, text: 'Status: ' + was + ' → ' + b.status, note: String(b.note || '').trim() });
    } else if (act === 'edit') {
      ['title', 'detail', 'targetDate'].forEach(f => { if (b[f] !== undefined) p[f] = String(b[f]).trim(); });
      if (Array.isArray(b.photos) && b.photos.length) p.photos = (p.photos || []).concat(b.photos);
      p.log.push({ at: now, by: who, text: 'Edited' });
    } else if (act === 'delete') {
      p.deleted = true; p.deletedAt = now;
      p.log.push({ at: now, by: who, text: 'Deleted' });
    } else {
      return res.status(400).json({ error: 'unknown action' });
    }

    await save(p);
    res.status(200).json({ ok: true, project: p });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
