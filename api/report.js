import { list } from '@vercel/blob';
export default async function handler(req, res){
  try{
    const id = (req.query.id || '').replace(/[^a-z0-9]/gi,'');
    if(!id) return res.status(400).json({error:'no id'});
    const { blobs } = await list({ prefix:`audits/${id}.json` });
    if(!blobs.length) return res.status(404).json({error:'not found'});
    const r = await fetch(blobs[0].url); const rec = await r.json();
    res.status(200).json(rec);
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
