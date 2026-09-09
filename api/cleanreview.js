import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';
import { PUBLIC_BASE } from './_site.js';

export const config = { maxDuration: 300 };

// The manager submits a finished cleaning sweep; Claude looks at each before/after
// pair and either passes it or sends it back.
//
// Judged per item, not as one batch: a single verdict over twenty photos gives no
// way to say which three need doing again, and that is the whole point.
const PROMPT = `You are the VP of Operations for K-BOB'S Steakhouse checking cleaning work a crew has just finished.

You get, for one item: what was flagged, the note the manager wrote, a BEFORE photo of the problem, and an AFTER photo the crew took when they finished.

Decide whether the AFTER photo shows the flagged problem actually dealt with.

PASS when the after photo shows the thing clean, or clearly and materially better. Ordinary wear, old stains that will not come out, and imperfect-but-clean are all PASS — you are judging whether it was cleaned, not whether it is new.

REDO only when you can SEE the problem is still there, or the after photo does not show the item at all (wrong area, a floor when the flag was a door, too dark or blurred to tell, or plainly the same untouched shot as the before).

Never REDO on suspicion. If you cannot tell, PASS — an honest crew member should not be sent back on a maybe.

Reply on ONE line, exactly:
PASS
or
REDO ~ <one short sentence, addressed to the crew, saying what still needs doing>`;

async function toBase64(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > 4_500_000) return null;
    return { media_type: r.headers.get('content-type') || 'image/jpeg', data: b.toString('base64') };
  } catch (e) { return null; }
}

async function judge(it) {
  const before = (it.photos || [])[0];
  const after = (it.afterPhotos || [])[0];
  if (!after) return { verdict: 'REDO', why: 'No photo was attached, so there is nothing to check.' };

  const content = [{ type: 'text', text:
    'Item: ' + it.item + '\nArea: ' + (it.sectionTitle || '') +
    '\nWhat was flagged: ' + (it.note || '(no note)') + '\n' }];

  const b = before ? await toBase64(before) : null;
  if (b) { content.push({ type: 'text', text: 'BEFORE (the problem):' }); content.push({ type: 'image', source: { type: 'base64', media_type: b.media_type, data: b.data } }); }
  const a = await toBase64(after);
  if (!a) return { verdict: 'PASS', why: '' };   // can't fetch it — don't punish the crew for our failure
  content.push({ type: 'text', text: 'AFTER (what the crew submitted):' });
  content.push({ type: 'image', source: { type: 'base64', media_type: a.media_type, data: a.data } });

  try {
    const rr = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 200, system: PROMPT, messages: [{ role: 'user', content }] })
    });
    const dd = await rr.json();
    const t = (Array.isArray(dd.content) ? dd.content.map(x => x.text || '').join(' ') : '').trim();
    if (/^REDO/i.test(t)) {
      const why = (t.split('~')[1] || '').trim();
      return { verdict: 'REDO', why: why || 'Please take another look at this one.' };
    }
    return { verdict: 'PASS', why: '' };
  } catch (e) {
    return { verdict: 'PASS', why: '' };         // a review outage must not block a closed-out sweep
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    const store = String(b.store || '').trim();
    const who = b.by || '';
    if (!store) return res.status(400).json({ error: 'store required' });

    const { blobs } = await list({ prefix: 'audits/' });
    const recs = (await Promise.all(blobs.map(async x => { try { return await readBlob(x.url); } catch (e) { return null; } })))
      .filter(Boolean).filter(r => !r.deleted && r.store === store);

    const passed = [], redo = [];
    for (const rec of recs) {
      const pending = (rec.items || []).filter(it => it.itemStatus === 'submitted');
      if (!pending.length) continue;
      const now = new Date().toISOString();
      for (const it of pending) {
        const v = await judge(it);
        if (!Array.isArray(it.log)) it.log = [];
        if (v.verdict === 'PASS') {
          it.resolved = true; it.itemStatus = 'done'; it.resolvedAt = now;
          it.resolvedBy = it.submittedBy || who; delete it.redoReason;
          it.log.push({ at: now, by: 'Claude', text: 'Reviewed — passed' });
          passed.push({ item: it.item, by: it.submittedBy || '' });
        } else {
          it.resolved = false; it.itemStatus = 'open'; it.redoReason = v.why;
          it.log.push({ at: now, by: 'Claude', text: 'Reviewed — needs another go', note: v.why });
          redo.push({ item: it.item, why: v.why, by: it.submittedBy || '' });
        }
      }
      await put('audits/' + rec.id + '.json', JSON.stringify(rec), {
        access: 'public', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
      });
    }

    try {
      const HOOKS = { 'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON, 'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS, 'Ruidoso': process.env.SLACK_WEBHOOK_RUIDOSO };
      const hook = HOOKS[store] || process.env.SLACK_WEBHOOK_URL;
      if (hook && (passed.length || redo.length)) {
        let text = '🧹 *' + store + '* — cleaning sweep reviewed' + (who ? ' (submitted by ' + who + ')' : '') + '\n'
          + '✅ ' + passed.length + ' passed' + (redo.length ? ('  ·  🔁 ' + redo.length + ' back for another go') : '');
        redo.slice(0, 8).forEach(r => { text += '\n   • ' + r.item + (r.why ? ' — _' + r.why + '_' : ''); });
        if (redo.length) text += '\n' + PUBLIC_BASE + '/kb-qsc-punchlist.html?store=' + encodeURIComponent(store);
        await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      }
    } catch (e) {}

    res.status(200).json({ ok: true, reviewed: passed.length + redo.length, passed: passed.length, redo });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
