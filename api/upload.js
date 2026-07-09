import { put } from '@vercel/blob';
export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  try{
    const { auditId, key, dataUrl } = req.body || {};
    if(!dataUrl) return res.status(400).json({error:'no image'});
    const buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64');
    const path = `photos/${auditId||'misc'}/${(key||'p')}-${Date.now()}-${Math.random().toString(36).slice(2,6)}.jpg`;
    const blob = await put(path, buf, { access:'public', contentType:'image/jpeg', addRandomSuffix:false });
    res.status(200).json({ url: blob.url });
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
