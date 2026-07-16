import { list, put } from '@vercel/blob';

export const config = { maxDuration: 60 };

const PROMPT = `You are the VP of Operations for K-BOB'S Steakhouse, reviewing a store manager's QSC (Quality, Sanitation & Cleanliness) audit. The photos are labeled by section below. Do two things: (1) look at the photos on the items the manager flagged Needs Attention or Repair and confirm the issue is real, and (2) spot-check the section proof photos to make sure the areas the manager marked clean actually look clean. Judge only what you can see in the photos.

Rules:
- You may DOWNGRADE an item (from OK to Needs Attention, or to Repair) when that section's photos clearly show a problem on that item — e.g., grimy or wet floors, dirty baseboards or grout, mold or buildup, trash, stained or damaged fixtures.
- You may NEVER upgrade or inflate a mark. If you agree with the manager, leave it.
- Only judge items you can actually SEE in that section's photos. Leave everything else exactly as the manager marked it. Do not invent problems.
- If a section's photos do not show that section's area at all (unrelated room, someone's home, an outdoor or construction area, etc.), mark that section MISMATCH. It will be treated as incomplete until correct photos are provided.
- If the same or clearly identical photos appear under more than one section, treat the sections they do not fit as MISMATCH and mention in the summary that the photos look reused across sections.
- Use the EXACT section titles and item names shown in the audit data.

Reply EXACTLY in this format (omit MISMATCH/DOWNGRADE lines if there are none):
SHORT: <one sentence for a Slack alert, max 25 words>
MISMATCH: <exact section title>
DOWNGRADE: <exact section title> ~ <exact item name> ~ <ATTENTION or REPAIR> ~ <short reason from the photo>
SUMMARY:
<Write like a VP giving a quick, measured read: 2-3 short sentences covering whether the manager's flagged issues are backed up by their photos, whether the areas marked clean actually look clean, and a brief read on the overall effort. Be brief and factual. Do not overcommit: no sweeping praise, no promises of follow-up, no next steps, no telling them to resubmit/reshoot/fix or provide correct photos, never say a section is incomplete, and don't restate the score.>`;

function markWord(m){ return m==='ok'?'OK':m==='attn'?'Needs Attention':m==='rep'?'Repair':m==='na'?'N/A':m; }

function buildFacts(rec, prior){
  let f = 'Store: ' + rec.store + '\nType: ' + rec.type + '\nManager: ' + rec.submittedBy + '\nDate: ' + rec.date + '\nManager self-grade: ' + rec.result + ' (' + rec.color + ')\n';
  const bySec = {};
  (rec.items || []).forEach(it => { (bySec[it.sectionTitle] = bySec[it.sectionTitle] || []).push(it); });
  f += '\nItems the manager marked, grouped by section (with their self-mark):\n';
  Object.keys(bySec).forEach(title => {
    f += '\n[' + title + ']\n';
    bySec[title].forEach(it => { f += '  - ' + it.item + ': ' + markWord(it.mark) + '\n'; });
  });
  f += '\nHealth Dept rule: that section must be 100% to pass.\n';
  if (prior) { f += '\nPrevious report (' + (prior.date || '') + '): ' + (prior.result || '') + '.' + (prior.aiSummary ? (' Prior note: ' + prior.aiSummary) : '') + '\n'; }
  return f;
}

export default async function handler(req, res) {
  try {
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    if (!id) return res.status(400).json({ error: 'missing id' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(200).json({ error: 'no_api_key' });

    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(404).json({ error: 'not found' });
    const rec = await (await fetch(found.blobs[0].url)).json();

    const force = req.query && req.query.force;
    if (rec.aiReviewedAt && !force) {
      return res.status(200).json({ short: rec.aiShort, summary: rec.aiSummary, mismatch: rec.aiMismatch || [], downgrades: rec.aiDowngrades || [], cached: true });
    }

    // section number -> title
    const secTitle = {};
    (rec.scores || []).forEach(x => { secTitle[x.section] = x.title; });
    (rec.items || []).forEach(it => { if (!secTitle[it.section]) secTitle[it.section] = it.sectionTitle; });

    // prior report for this store
    let prior = null;
    try {
      const all = await list({ prefix: 'audits/' });
      const recs = await Promise.all(all.blobs.map(async b => { try { return await (await fetch(b.url)).json(); } catch (e) { return null; } }));
      const same = recs.filter(r => r && r.store === rec.store && r.id !== rec.id && String(r.submittedAt || '') < String(rec.submittedAt || ''))
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
      prior = same[0] || null;
    } catch (e) {}

    // labeled content
    let areaMap = {};
    if (rec.areaPhotos && Object.keys(rec.areaPhotos).length) {
      areaMap = rec.areaPhotos;
    } else if (rec.formState && rec.formState.areaPhotos) {
      const fa = rec.formState.areaPhotos;
      Object.keys(fa).forEach(function (sn) { areaMap[sn] = (fa[sn] || []).map(function (p) { return (p && p.url) ? p.url : p; }).filter(Boolean); });
    }
    // gather EVERY photo, grouped by section: section proof photos + each flagged item's photo
    const perSec = {};
    Object.keys(areaMap).forEach(function (sn) { const t = secTitle[sn] || ('Section ' + sn); (perSec[t] = perSec[t] || []); (areaMap[sn] || []).forEach(function (u) { if (u) perSec[t].push(u); }); });
    (rec.items || []).forEach(function (it) { if (it.photos && it.photos.length) { const t = it.sectionTitle || ('Section ' + it.section); (perSec[t] = perSec[t] || []); it.photos.forEach(function (u) { if (u) perSec[t].push(u); }); } });

    const content = [{ type: 'text', text: PROMPT + '\n\n=== AUDIT DATA ===\n' + buildFacts(rec, prior) }];
    let imgCount = 0; const MAXIMG = 60, PERSEC = 12;  // review all photos across every section
    Object.keys(perSec).forEach(function (t) {
      const arr = perSec[t].slice(0, PERSEC);
      if (!arr.length) return;
      content.push({ type: 'text', text: '=== Photos for section: ' + t + ' (' + perSec[t].length + ' submitted) ===' });
      arr.forEach(function (u) { if (imgCount < MAXIMG) { content.push({ type: 'image', source: { type: 'url', url: u } }); imgCount++; } });
    });

    if (imgCount === 0) {
      content.push({ type: 'text', text: 'NOTE: No photos were submitted for this audit. Do not output any MISMATCH or DOWNGRADE lines and do not mention photos, reshooting, or verification. Still provide SHORT and a brief SUMMARY (1-2 sentences) describing the findings based only on the marks and notes above.' });
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 1024, messages: [{ role: 'user', content }] })
    });
    const data = await r.json();
    if (!r.ok) return res.status(200).json({ error: 'api ' + r.status + ': ' + JSON.stringify(data).slice(0, 200) });

    let txt = '';
    if (data && Array.isArray(data.content)) txt = data.content.map(function (b) { return (b && b.text) || ''; }).join('\n').trim();

    const shortM = txt.match(/SHORT:\s*(.+)/i);
    const aiShort = shortM ? shortM[1].trim() : 'Reviewed.';
    const mismatch = [];
    const downgrades = [];
    txt.split('\n').forEach(function (line) {
      const mm = line.match(/^\s*MISMATCH:\s*(.+)$/i);
      if (mm) { mismatch.push(mm[1].trim()); return; }
      const dd = line.match(/^\s*DOWNGRADE:\s*(.+)$/i);
      if (dd) {
        const p = dd[1].split('~').map(function (x) { return x.trim(); });
        if (p.length >= 2) { const lvl = (p[2] || '').toLowerCase(); downgrades.push({ section: p[0], item: p[1], mark: /rep/.test(lvl) ? 'rep' : 'attn', reason: p[3] || '' }); }
      }
    });
    const sumM = txt.match(/SUMMARY:\s*([\s\S]*)$/i);
    let summary = sumM ? sumM[1].trim() : txt;

    rec.aiShort = aiShort;
    rec.aiSummary = summary || '(no summary)';
    rec.aiMismatch = mismatch;
    rec.aiDowngrades = downgrades;
    rec.aiReviewedAt = new Date().toISOString();
    try { await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true }); } catch (e2) {}

    res.status(200).json({ short: aiShort, summary: rec.aiSummary, mismatch: mismatch, downgrades: downgrades });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
