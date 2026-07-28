export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({error:'POST only'});
  try{
    const body = req.body || {};
    const store = body.store || '';
    // Per-store channels via per-channel incoming webhooks. Falls back to the
    // default webhook for any store without its own (e.g. Ruidoso until added).
    const HOOKS = {
      'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON,
      'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS,
      'Ruidoso': process.env.SLACK_WEBHOOK_RUIDOSO
    };
    const hook = HOOKS[store] || process.env.SLACK_WEBHOOK_URL || "https://hooks.slack.com/services/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";
    const payload = Object.assign({}, body);
    delete payload.store;   // routing hint only — don't forward it to Slack
    const r = await fetch(hook, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    res.status(200).json({ ok: r.ok });
  }catch(e){ res.status(500).json({ error:String(e) }); }
}
