import { put } from '@vercel/blob';
import { createHash } from 'crypto';

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
    const id = record.id || fallbackId(record);
    record.id = id;
    record.savedAt = new Date().toISOString();
    await put(`audits/${id}.json`, JSON.stringify(record), { access:'public', contentType:'application/json', addRandomSuffix:false, allowOverwrite: true, cacheControlMaxAge: 0 });
    res.status(200).json({ id, reportUrl: `/kb-qsc-report.html?id=${id}` });
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
