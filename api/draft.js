import { put, list } from '@vercel/blob';
export default async function handler(req, res){
  try{
    if(req.method === 'POST'){
      const d = req.body || {};
      const key = `${(d.store||'x')}__${(d.by||'x')}`.replace(/[^a-z0-9_]/gi,'-');
      await put(`drafts/${key}.json`, JSON.stringify(d), { access:'public', contentType:'application/json', addRandomSuffix:false });
      return res.status(200).json({ ok:true });
    }
    if(req.method === 'GET'){
      const key = `${(req.query.store||'x')}__${(req.query.by||'x')}`.replace(/[^a-z0-9_]/gi,'-');
      const { blobs } = await list({ prefix:`drafts/${key}.json` });
      if(!blobs.length) return res.status(200).json(null);
      const r = await fetch(blobs[0].url); return res.status(200).json(await r.json());
    }
    res.status(405).json({error:'GET or POST'});
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
