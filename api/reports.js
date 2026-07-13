import { list } from '@vercel/blob';
export default async function handler(req, res){
  try{
    const { blobs } = await list({ prefix:'audits/' });
    const items = await Promise.all(blobs.map(async b=>{ try{ const r=await fetch(b.url); return await r.json(); }catch(e){ return null; } }));
    let out = items.filter(Boolean).filter(r=>!r.deleted).map(r=>({ id:r.id, store:r.store, type:r.type, submittedBy:r.submittedBy, date:r.date, result:r.result, color:r.color, submittedAt:r.submittedAt, mode:r.mode, spotSections:r.spotSections, spotTitles:r.spotTitles, incomplete:r.incomplete, verification:r.verification }));
    const store = req.query.store; if(store) out = out.filter(x=>x.store===store);
    out.sort((a,b)=> String(b.submittedAt||'').localeCompare(String(a.submittedAt||'')));
    res.status(200).json(out.slice(0, 60));
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
