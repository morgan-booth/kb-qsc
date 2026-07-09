export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  try{
    const hook = process.env.SLACK_WEBHOOK_URL || "https://hooks.slack.com/services/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";
    const r = await fetch(hook, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(req.body||{}) });
    const ok = r.ok;
    res.status(200).json({ ok });
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
