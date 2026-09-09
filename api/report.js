import { list } from '@vercel/blob';
import { readBlob } from './_blob.js';
import { workTypeOf, familyOf } from './_worktype.js';
export default async function handler(req, res){
  try{
    const id = (req.query.id || '').replace(/[^a-z0-9]/gi,'');
    if(!id) return res.status(400).json({error:'no id'});
    const { blobs } = await list({ prefix:`audits/${id}.json` });
    if(!blobs.length) return res.status(404).json({error:'not found'});
    const rec = await readBlob(blobs[0].url);
    // Tag each item with its work type so the report can group the punch-list the
    // same way the punch-list page does, without a third copy of the rules.
    (rec.items || []).forEach(it => {
      const wt = it.workType || workTypeOf(it);
      it.bucket = wt;
      it.family = familyOf(wt);
    });
    res.status(200).json(rec);
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
