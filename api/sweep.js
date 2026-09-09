import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';

export const config = { maxDuration: 60 };

// Close a whole cleaning sweep in ONE write per audit.
//
// Closing 23 items one call at a time means 23 read-modify-writes against the
// same blob in a couple of minutes, and blob reads are eventually consistent —
// so some of them get silently dropped. A sweep is worked by one manager on one
// device, so the client can hand us the finished list and we apply it all at
// once. One read, one mutate, one put, verified.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    const who = b.by || '';
    const closures = Array.isArray(b.closures) ? b.closures : [];
    if (!closures.length) return res.status(400).json({ error: 'nothing to close' });

    const byAudit = {};
    closures.forEach(c => { if (c && c.auditId) (byAudit[c.auditId] = byAudit[c.auditId] || []).push(c); });

    const done = [], failed = [];
    for (const auditId of Object.keys(byAudit)) {
      const group = byAudit[auditId];
      const found = await list({ prefix: 'audits/' + auditId + '.json' });
      if (!found.blobs.length) { group.forEach(c => failed.push({ item: c.item, why: 'audit not found' })); continue; }
      const blobUrl = found.blobs[0].url;
      const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);

      let landed = false, applied = [];
      for (let attempt = 1; attempt <= 4 && !landed; attempt++) {
        const rec = await readBlob(blobUrl);
        const now = new Date().toISOString();
        applied = [];
        group.forEach(c => {
          const it = (rec.items || []).find(x => String(x.section) === String(c.section) && x.item === c.item);
          if (!it) return;
          if (!Array.isArray(it.log)) it.log = [];
          it.resolved = false; it.itemStatus = 'submitted';
          it.afterPhotos = Array.isArray(c.afterPhotos) ? c.afterPhotos : [];
          it.submittedBy = who; it.submittedForReviewAt = now;
          it.resolveNote = c.note || '';
          delete it.redoReason;
          it.log.push({ at: now, by: who, text: 'Cleaned, awaiting review', photos: it.afterPhotos, _w: stamp });
          applied.push(it.item);
        });
        if (!applied.length) break;
        await put('audits/' + auditId + '.json', JSON.stringify(rec), {
          access: 'public', contentType: 'application/json',
          addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
        });
        const back = await readBlob(blobUrl).catch(() => null);
        const stuck = back && (back.items || []).filter(x => (x.log || []).some(e => e._w === stamp)).length;
        if (stuck === applied.length) landed = true;
        else await new Promise(r => setTimeout(r, 250 * attempt));
      }
      if (landed) applied.forEach(i => done.push(i));
      else group.forEach(c => failed.push({ item: c.item, why: 'write did not stick' }));
    }

    // One Slack line for the sweep, not one per item.
    try {
      if (done.length) {
        const store = b.store || '';
        const HOOKS = { 'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON, 'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS, 'Ruidoso': process.env.SLACK_WEBHOOK_RUIDOSO };
        const hook = HOOKS[store] || process.env.SLACK_WEBHOOK_URL;
        if (hook) await fetch(hook, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '🧹 *' + store + '* — ' + done.length + ' cleaning item' + (done.length === 1 ? '' : 's') + ' photographed' + (who ? ' by ' + who : '') + ', waiting on the manager to submit for review' })
        });
      }
    } catch (e) {}

    res.status(200).json({ ok: failed.length === 0, submitted: done.length, closed: done.length, failed });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
