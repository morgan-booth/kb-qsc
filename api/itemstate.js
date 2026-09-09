import { list, put } from '@vercel/blob';
import { createHash } from 'crypto';
import { readBlob } from './_blob.js';
import { normName } from './_worktype.js';

export const config = { maxDuration: 30 };

// Per-item state: who it's assigned to, its work type, and the comment thread.
//
// This deliberately does NOT live in the audit record. Every item of an audit
// shares that one blob, so two managers touching two DIFFERENT items still
// collide, and the loser's write is silently dropped — that is the bug this
// replaces. Here each item owns a file, so unrelated edits never contend at all.
// Only two people editing the SAME item can race, and the read-back below
// catches that.
//
// The audit record stays the source of truth for the inspection itself: the
// mark, the note, the photo, the close-out. Only the mutable collaboration
// layer moved.
const keyOf = (auditId, section, item) =>
  createHash('sha1').update(String(section) + '|' + String(item)).digest('hex').slice(0, 16);
const pathOf = (auditId, section, item) =>
  'itemstate/' + String(auditId).replace(/[^a-z0-9]/gi, '') + '/' + keyOf(auditId, section, item) + '.json';
const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method === 'GET') {
      const auditId = req.query && req.query.auditId;
      const prefix = auditId ? ('itemstate/' + String(auditId).replace(/[^a-z0-9]/gi, '') + '/') : 'itemstate/';
      const { blobs } = await list({ prefix });
      const rows = await Promise.all(blobs.map(async b => { try { return await readBlob(b.url); } catch (e) { return null; } }));
      return res.status(200).json(rows.filter(Boolean));
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const b = req.body || {};
    const { auditId, section, item } = b;
    if (!auditId || section == null || !item) return res.status(400).json({ error: 'missing auditId/section/item' });
    const who = b.by || '';
    const act = b.action || 'assign';
    const path = pathOf(auditId, section, item);
    const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);

    for (let attempt = 1; attempt <= 4; attempt++) {
      const found = await list({ prefix: path });
      let rec = found.blobs.length ? await readBlob(found.blobs[0].url).catch(() => null) : null;
      if (!rec) rec = { auditId, section, item, assignee: '', workType: '', comments: [] };
      if (!Array.isArray(rec.comments)) rec.comments = [];

      if (act === 'assign') {
        if (b.assignee !== undefined) rec.assignee = normName(b.assignee);
        if (b.workType !== undefined) rec.workType = String(b.workType || '').trim();
      } else if (act === 'comment') {
        const text = String(b.text || '').trim();
        if (!text) return res.status(400).json({ error: 'empty comment' });
        rec.comments.push({ id: nid(), by: who, at: new Date().toISOString(), text, corp: !!b.corp, _w: stamp });
      } else if (act === 'uncomment') {
        rec.comments = rec.comments.filter(c => c.id !== b.commentId);
      } else {
        return res.status(400).json({ error: 'unknown action' });
      }
      rec.updatedAt = new Date().toISOString();
      rec.updatedBy = who;
      rec._w = stamp;

      await put(path, JSON.stringify(rec), {
        access: 'public', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
      });
      // Only a concurrent edit of this same item can lose our write; confirm it stuck.
      const back = await readBlob((await list({ prefix: path })).blobs[0].url).catch(() => null);
      if (back && back._w === stamp) return res.status(200).json({ ok: true, state: back });
      await new Promise(r => setTimeout(r, 200 * attempt));
    }
    res.status(409).json({ error: 'busy — that change did not save, try again' });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
