import { list, put } from '@vercel/blob';
import { createHash } from 'crypto';
import { readBlob } from './_blob.js';

// A missing record.id used to mint a fresh random id on every POST, so one audit
// resubmitted from a restored draft fanned out into many orphan records. The form
// now always sends its id; if one still arrives without, derive a STABLE id from
// the audit's own identity so repeat posts overwrite instead of multiplying.
function fallbackId(rec) {
  const seed = [rec.store, rec.submittedBy, rec.date, rec.mode, rec.startedAt].filter(Boolean).join('|');
  if (seed && rec.startedAt) return 'a' + createHash('sha1').update(seed).digest('hex').slice(0, 11);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  try{
    const record = req.body || {};
    const final = !!record.final; delete record.final;   // routing hint, not part of the record
    const id = record.id || fallbackId(record);
    record.id = id;
    record.savedAt = new Date().toISOString();

    // Announce once. A submit takes a while — photos upload, then Claude grades —
    // and a second tap used to run the whole thing again and post its own "just
    // finished" line. Dave's 9/17 Corpus review went to Slack three times that way.
    // The stored record holds the announcement, so whoever saves the final version
    // first owns it; later saves are told it is already done and stay quiet.
    let prev = null;
    try {
      const found = await list({ prefix: `audits/${id}.json` });
      if (found.blobs.length) prev = await readBlob(found.blobs[0].url).catch(() => null);
    } catch (e) {}
    const announced = !!(prev && prev.announcedAt);
    // Carry it on every save, final or not. The pre-grading save of a second tap
    // would otherwise wipe the flag and let that tap announce all over again.
    if (announced) record.announcedAt = prev.announcedAt;
    else if (final) record.announcedAt = new Date().toISOString();
    await put(`audits/${id}.json`, JSON.stringify(record), { access:'public', contentType:'application/json', addRandomSuffix:false, allowOverwrite: true, cacheControlMaxAge: 0 });
    res.status(200).json({ id, reportUrl: `/kb-qsc-report.html?id=${id}`, announced });
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
