import { list, put } from '@vercel/blob';

export const config = { maxDuration: 60 };

const PROMPT = `You are an experienced Quality, Sanitation & Cleanliness (QSC) auditor and coach for K-BOB'S Steakhouse. A store manager submitted a self-audit with a grade and proof photos. Write an honest, constructive executive summary addressed to the manager ("you").

Guidelines:
- Start by acknowledging genuinely good work when it's warranted.
- State the result and, if it is not a pass, explain plainly why (for example, the Health Department section must score 100%).
- Name the top 1-3 things to focus on before the next review.
- If a previous report is provided, note real progress or regression.
- Be HONEST about the photos. If a photo shows conditions worse than the manager's grade indicates (for example, visibly dirty floors on an item marked OK or a section marked Pass), say so directly and note that the grade looks optimistic. Do NOT invent problems that are not visible in the photos.
- Keep it to 4-7 sentences, warm but direct.

Respond ONLY with JSON, no prose outside it:
{"verdict":"consistent"|"concerns","summary":"<the executive summary>","flags":["<each specific photo-vs-grade discrepancy, empty array if none>"]}`;

function buildFacts(rec, prior) {
  const scores = (rec.scores || []).map(x =>
    '- ' + x.title + ': ' + (x.na ? 'N/A' : (x.pass ? 'Pass' : 'Fail')) +
    (x.na ? '' : ' (' + x.ok + '/' + x.applicable + ' OK' + (x.repairs ? ', ' + x.repairs + ' repair' : '') + ')')
  ).join('\n');
  const flags = (rec.items || []).filter(x => x.mark === 'attn' || x.mark === 'rep')
    .map(x => '- [' + x.mark + '] ' + x.item + (x.note ? ': ' + x.note : '')).join('\n');
  let f = 'Store: ' + rec.store + '\nType: ' + rec.type + '\nManager: ' + rec.submittedBy +
    '\nDate: ' + rec.date + "\nManager's grade: " + rec.result + ' (' + rec.color + ')\n\nSection scores:\n' + scores + '\n';
  f += flags ? ('\nItems the manager flagged:\n' + flags + '\n') : '\nThe manager flagged no items.\n';
  f += '\nHealth Dept rule: that section must be 100% to pass; 1 repair caps the audit at Yellow, 2+ = Fail.\n';
  if (prior) {
    f += '\nPrevious report for this store (' + (prior.date || '') + '): ' + (prior.result || '') + ' (' + (prior.color || '') + ').';
    if (prior.aiSummary) f += ' Prior summary: ' + prior.aiSummary;
    f += '\n';
  }
  return f;
}

export default async function handler(req, res) {
  try {
    if (req.query && req.query.debug) {
      const out = [];
      out.push('ANTHROPIC_API_KEY present: ' + (!!process.env.ANTHROPIC_API_KEY));
      out.push('model: claude-sonnet-5');
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 20, messages: [{ role: 'user', content: 'Reply with the word OK.' }] })
        });
        const t = await r.text();
        out.push('text-call HTTP ' + r.status);
        out.push('response: ' + t.slice(0, 500));
      } catch (e) { out.push('text-call FAILED: ' + String(e)); }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send('<html><body style="font-family:monospace;padding:16px">' + out.map(function(l){return '<p>'+String(l).split('&').join('&amp;').split('<').join('&lt;')+'</p>';}).join('') + '</body></html>');
    }
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    if (!id) return res.status(400).json({ error: 'missing id' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ error: 'no_api_key' });

    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(404).json({ error: 'not found' });
    const rec = await (await fetch(found.blobs[0].url)).json();

    const force = req.query && req.query.force;
    if (rec.aiSummary && !force) {
      return res.status(200).json({ summary: rec.aiSummary, verdict: rec.aiVerdict, flags: rec.aiFlags, cached: true });
    }

    const photos = [];
    Object.values(rec.areaPhotos || {}).forEach(arr => (arr || []).forEach(u => photos.push(u)));
    (rec.items || []).forEach(it => (it.photos || []).forEach(u => photos.push(u)));
    const imgs = photos.slice(0, 10);

    let prior = null;
    try {
      const all = await list({ prefix: 'audits/' });
      const recs = await Promise.all(all.blobs.map(async b => { try { return await (await fetch(b.url)).json(); } catch (e) { return null; } }));
      const same = recs.filter(r => r && r.store === rec.store && r.id !== rec.id && String(r.submittedAt || '') < String(rec.submittedAt || ''))
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
      prior = same[0] || null;
    } catch (e) {}

    const content = [{ type: 'text', text: PROMPT + '\n\n=== AUDIT DATA ===\n' + buildFacts(rec, prior) + '\nThe proof photos follow.' }];
    imgs.forEach(u => content.push({ type: 'image', source: { type: 'url', url: u } }));

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 900, messages: [{ role: 'user', content }] })
    });
    const data = await r.json();
    if (!r.ok) return res.status(200).json({ error: 'api ' + r.status + ': ' + JSON.stringify(data).slice(0, 200) });

    let txt = (data.content && data.content[0] && data.content[0].text) || '';
    let parsed;
    try { parsed = JSON.parse(txt.match(/\{[\s\S]*\}/)[0]); } catch (e) { parsed = { summary: txt, verdict: '', flags: [] }; }

    rec.aiSummary = parsed.summary || txt;
    rec.aiVerdict = parsed.verdict || '';
    rec.aiFlags = Array.isArray(parsed.flags) ? parsed.flags : [];
    rec.aiReviewedAt = new Date().toISOString();
    try { await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true }); } catch (e2) {}

    res.status(200).json({ summary: rec.aiSummary, verdict: rec.aiVerdict, flags: rec.aiFlags });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
