import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';
import { PUBLIC_BASE } from './_site.js';

export const config = { maxDuration: 300 };

// The manager submits a finished cleaning sweep; Claude looks at each before/after
// pair and either passes it or sends it back.
//
// Judged per item, not as one batch: a single verdict over twenty photos gives no
// way to say which three need doing again, and that is the whole point.
const PROMPT = `You are the VP of Operations for K-BOB'S Steakhouse looking over cleaning work a crew has just finished.

You get, for one item: what was flagged, the note the manager wrote, a BEFORE photo of the problem, and an AFTER photo the crew took when they finished.

The work is being accepted either way — you are not blocking anyone. Your only job is to say whether a manager should glance at this one himself.

Answer OK when the after photo shows the thing clean, or clearly better. Ordinary wear, old stains that will not come out, and imperfect-but-clean are all OK.

Answer LOOK only when a manager would genuinely want to see it: the problem looks untouched, or the photo does not show the item at all (wrong area, too dark or blurred to tell, or plainly the same shot as the before).

When in doubt, OK. A crew member who did the work should not be second-guessed, and a manager should not be sent to look at something fine.

Reply on ONE line, exactly:
OK
or
LOOK ~ <one short sentence to the manager saying what to check>`;

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
  if (!after) return { verdict: 'LOOK', why: 'No photo came through on this one.' };

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
    if (/^LOOK/i.test(t)) {
      const why = (t.split('~')[1] || '').trim();
      return { verdict: 'LOOK', why: why || 'Worth a quick look.' };
    }
    return { verdict: 'OK', why: '' };
  } catch (e) {
    return { verdict: 'OK', why: '' };           // a review outage must not cast doubt on finished work
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
        // Everything closes. The work was done; a photo a model found hard to read
        // is not grounds for making someone do it twice.
        it.resolved = true; it.itemStatus = 'done'; it.resolvedAt = now;
        it.resolvedBy = it.submittedBy || who; delete it.redoReason;
        if (v.verdict === 'LOOK') {
          it.secondLook = v.why;
          it.log.push({ at: now, by: 'Claude', text: 'Closed — worth a second look', note: v.why });
          redo.push({ item: it.item, why: v.why, by: it.submittedBy || '' });
        } else {
          delete it.secondLook;
          it.log.push({ at: now, by: 'Claude', text: 'Reviewed — looks good' });
        }
        passed.push({ item: it.item, by: it.submittedBy || '' });
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
        let text = '🧹 *' + store + '* — got all your cleaning fixes'
          + (who ? ' (submitted by ' + who + ')' : '') + '. '
          + '✅ ' + passed.length + ' closed out.';
        if (redo.length) {
          text += '\n\n' + redo.length + (redo.length === 1 ? ' could use a second look' : ' could use a second look')
            + ' when you get a minute — nothing is holding anything up:';
          redo.slice(0, 8).forEach(r => { text += '\n   • ' + r.item + (r.why ? ' — _' + r.why + '_' : ''); });
          text += '\n' + PUBLIC_BASE + '/kb-qsc-punchlist.html?store=' + encodeURIComponent(store) + '&status=done';
        }
        await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      }
    } catch (e) {}

    res.status(200).json({ ok: true, reviewed: passed.length, passed: passed.length, secondLook: redo });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
