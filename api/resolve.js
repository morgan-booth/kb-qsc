import { list, put } from '@vercel/blob';
import { normName } from './_worktype.js';
import { readBlob } from './_blob.js';

export const config = { maxDuration: 30 };

// Per-store Slack channel IDs (env overrides, with known fallbacks).
const CHANNELS = {
  'Fort Stockton': process.env.SLACK_CHANNEL_STOCKTON || 'C0BKZLJL1C5',
  'Corpus Christi': process.env.SLACK_CHANNEL_CORPUS || 'C0BKWMV47S7',
  'Ruidoso': process.env.SLACK_CHANNEL_RUIDOSO || ''
};

function centralDate() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
function niceDate() { try { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }).format(new Date()); } catch (e) { return ''; } }

async function slackApi(method, token, payload) {
  const r = await fetch('https://slack.com/api/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(payload)
  });
  return await r.json();
}

async function loadAnchors() {
  try { const { blobs } = await list({ prefix: 'meta/slack-anchors.json' }); if (!blobs.length) return {}; const u = blobs[0].url + (blobs[0].url.includes('?') ? '&' : '?') + '_=' + Date.now(); return await (await fetch(u, { cache: 'no-store' })).json(); } catch (e) { return {}; }
}
async function saveAnchors(a) {
  try { await put('meta/slack-anchors.json', JSON.stringify(a), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 }); } catch (e) {}
}

// Count a store's still-open (unresolved, non-capital) attention/repair items across every audit.
// Uses the freshest in-memory record for the audit we just wrote (blob list can lag).
async function countStoreOpen(store, currentRec) {
  try {
    const { blobs } = await list({ prefix: 'audits/' });
    const recs = await Promise.all(blobs.map(async b => { try { const u = b.url + (b.url.includes('?') ? '&' : '?') + '_=' + Date.now(); return await (await fetch(u, { cache: 'no-store' })).json(); } catch (e) { return null; } }));
    const map = {};
    recs.filter(Boolean).forEach(r => { if (r && r.id) map[r.id] = r; });
    if (currentRec && currentRec.id) map[currentRec.id] = currentRec;
    let n = 0;
    Object.values(map).filter(r => !r.deleted && (r.store || '') === store).forEach(r => {
      (r.items || []).forEach(it => {
        if (it.capital) return;
        if (it.mark !== 'attn' && it.mark !== 'rep') return;
        if (!(!!it.resolved || it.itemStatus === 'done' || it.itemStatus === 'blocked')) n++;
      });
    });
    return n;
  } catch (e) { return null; }
}

// Update a punch-list item's lifecycle and progress log on the audit record.
// Actions: fix (done, photo), ordered (materials on the way), blocked (can't repair, reason),
//          log (progress note / call), clear (corporate close, no photo), reopen.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const b = req.body || {};
    const { id, section, item } = b;
    if (!id || section == null || !item) return res.status(400).json({ error: 'missing id/section/item' });
    const who = b.by || b.resolvedBy || '';
    const act = b.action || (b.reopen ? 'reopen' : 'fix');
    const photos = Array.isArray(b.photos) ? b.photos : (Array.isArray(b.afterPhotos) ? b.afterPhotos : []);
    const note = b.note || '';
    const reason = b.reason || note;

    // Every item in an audit shares ONE blob, so a manager assigning five items in a
    // row is five read-modify-writes on the same file. Blob reads are eventually
    // consistent, so a plain read/mutate/put silently loses whichever write was
    // still in flight. Read, mutate, put, then read BACK and confirm our own change
    // survived; if it didn't, someone raced us — redo it against the fresher copy.
    const found = await list({ prefix: 'audits/' + id + '.json' });
    if (!found.blobs.length) return res.status(404).json({ error: 'audit not found' });
    const blobUrl = found.blobs[0].url;
    const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);   // proves the write is OURS
    let rec, it, attempt = 0, landed = false;
    while (attempt++ < 5) {
      rec = await readBlob(blobUrl);
      it = (rec.items || []).find(x => String(x.section) === String(section) && x.item === item);
      if (!it) return res.status(404).json({ error: 'item not found' });

      if (!Array.isArray(it.log)) it.log = [];
      const now = new Date().toISOString();
      const logEntry = (text, extra) => { it.log.push(Object.assign({ at: now, by: who, text: text, _w: stamp }, extra || {})); };

    if (act === 'reopen') {
      it.resolved = false; it.itemStatus = 'open';
      delete it.resolvedAt; delete it.resolvedBy; delete it.afterPhotos; delete it.resolveNote; delete it.blockedReason;
      logEntry('Reopened');
    } else if (act === 'ordered') {
      it.resolved = false; it.itemStatus = 'ordered';
      logEntry('Materials ordered', { note: note });
    } else if (act === 'blocked') {
      it.resolved = false; it.itemStatus = 'blocked'; it.blockedReason = reason;
      logEntry("Can't repair", { note: reason });
    } else if (act === 'log') {
      logEntry('Update', { note: note, photos: photos });
    } else if (act === 'assign') {
      // Moved to api/itemstate.js — assignment lives in its own per-item blob now,
      // so it can't be lost to a concurrent edit of a different item in this audit.
      return res.status(410).json({ error: 'assignment moved to /api/itemstate' });
    } else if (act === 'clear') {
      it.resolved = true; it.itemStatus = 'done'; it.resolvedAt = now; it.resolvedBy = who; it.afterPhotos = []; it.resolveNote = 'Cleared by corporate (no update)';
      logEntry('Cleared by corporate');
    } else { // fix
      it.resolved = true; it.itemStatus = 'done'; it.resolvedAt = now; it.resolvedBy = who; it.afterPhotos = photos; it.resolveNote = note;
      logEntry('Fixed', { note: note, photos: photos });
    }

      await put('audits/' + id + '.json', JSON.stringify(rec), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0 });
      const back = await readBlob(blobUrl).catch(() => null);
      const bit = back && (back.items || []).find(x => String(x.section) === String(section) && x.item === item);
      if (bit && (bit.log || []).some(e => e._w === stamp)) { landed = true; break; }
      await new Promise(r => setTimeout(r, 200 * attempt));   // let the store settle, then redo on fresh data
    }
    if (!landed) return res.status(409).json({ error: 'busy — that change did not save, try again' });

    // Push the status change to the store's Slack channel.
    // Preferred: threaded under ONE daily anchor per store, with a live "N still open" count on the anchor.
    // Fallback (no bot token): a slim one-liner on the incoming webhook — no repeated link, with the count.
    try {
      const store = rec.store || '';
      const where = (it.sectionTitle || ('Section ' + it.section)) + ' — ' + it.item;
      const isClose = (act === 'fix' || act === 'clear');
      const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'kbobs-qsc-app.vercel.app');
      const plink = base + '/kb-qsc-punchlist.html?store=' + encodeURIComponent(store);
      const open = await countStoreOpen(store, rec);

      let line = '';
      if (act === 'fix') line = '✅ ' + where + (note ? ' — _' + note + '_' : '') + (who ? ' · ' + who : '');
      else if (act === 'clear') line = '✅ ' + where + ' — cleared (corporate)' + (who ? ' · ' + who : '');
      else if (act === 'ordered') line = '⏳ ' + where + ' — in progress' + (note ? ' (' + note + ')' : '') + (who ? ' · ' + who : '');
      else if (act === 'blocked') line = '⛔ ' + where + " — can't repair" + (reason ? ': ' + reason : '') + (who ? ' · ' + who : '');
      else if (act === 'log') line = '📝 ' + where + (note ? ' — ' + note : '') + (who ? ' · ' + who : '');

      const token = process.env.SLACK_BOT_TOKEN;
      const channel = CHANNELS[store];

      if (token && channel && line) {
        // THREADED path — one anchor per store per day; fixes are replies; anchor shows the running count.
        const anchors = await loadAnchors();
        const today = centralDate();
        let a = anchors[store];
        const openCount = (open == null ? '?' : open);
        const headerText = () => '🧾 *' + store + ' — punch-list progress · ' + niceDate() + '*\n' + ((a && a.fixed) || 0) + ' fixed today · ' + openCount + ' still open\nFull list → ' + plink;
        if (!a || a.date !== today || !a.ts) {
          a = { date: today, fixed: 0, channel: channel };
          const created = await slackApi('chat.postMessage', token, { channel: channel, text: headerText(), unfurl_links: false });
          if (created && created.ok) { a.ts = created.ts; a.channel = created.channel || channel; }
          anchors[store] = a;
        }
        if (a.ts) {
          await slackApi('chat.postMessage', token, { channel: a.channel, thread_ts: a.ts, text: line, unfurl_links: false });
          if (isClose) a.fixed = (a.fixed || 0) + 1;
          anchors[store] = a;
          await slackApi('chat.update', token, { channel: a.channel, ts: a.ts, text: headerText(), unfurl_links: false });
          await saveAnchors(anchors);
        }
      } else {
        // FALLBACK path — webhooks can't thread; keep it to a slim one-liner with the remaining count.
        const HOOKS = { 'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON, 'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS, 'Ruidoso': process.env.SLACK_WEBHOOK_RUIDOSO };
        const hook = HOOKS[store] || process.env.SLACK_WEBHOOK_URL;
        if (hook && line) {
          const tail = (open == null ? '' : ' · ' + open + ' left');
          await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '*' + store + '* ' + line + tail }) });
        }
      }
    } catch (e) {}

    res.status(200).json({ ok: true, itemStatus: it.itemStatus, resolved: !!it.resolved });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
