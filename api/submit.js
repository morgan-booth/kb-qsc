import { put } from '@vercel/blob';
export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  try{
    const record = req.body || {};
    const id = record.id || (Date.now().toString(36) + Math.random().toString(36).slice(2,6));
    record.id = id;
    record.savedAt = new Date().toISOString();
    await put(`audits/${id}.json`, JSON.stringify(record), { access:'public', contentType:'application/json', addRandomSuffix:false });
    res.status(200).json({ id, reportUrl: `/kb-qsc-report.html?id=${id}` });
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
