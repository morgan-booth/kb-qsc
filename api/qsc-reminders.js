import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';
import { PUBLIC_BASE } from './_site.js';
import { SPOT_ROTATION, titleOf } from './_sections.js';
import { todayCentral } from './_when.js';

export const config = { maxDuration: 60 };

// Scheduled QSC reminders (Vercel Cron, once a day).
//
// These used to be scheduled drafts written by hand in Slack. The app already
// knows what has actually been inspected, so it can ask for the work itself —
// and, more usefully, stay quiet when the work is already done. A reminder for
// something a manager finished yesterday is how people learn to ignore reminders.
//
// The whole cadence lives here so it can be changed in one place.
// Tuesday is inventory day at both stores. Nothing is ever asked for on one —
// an audit landing on a count day is an audit that gets stood down.
const NEVER_DOW = 2;
// Thursday, and only Thursday — from the GMs themselves. Karina is off Friday and
// Saturday, or Sunday and Monday; Bryan takes his days early in the week, or just
// Saturday. With Tuesday gone to inventory, Thursday is the one day neither of them
// is ever off. Wednesday would catch Bryan, Friday would catch Karina, and asking a
// manager for an audit on their day off is how the whole thing gets ignored.
// Twice a week was the original ask; once a week on a day they are both actually
// working beats twice a week half-landing on nobody.
const SPOT_DOWS = [4];               // spot check: Thursday
const SPOT_SECTIONS = 2;             // two sections each time
// The full 12-section QSC belongs at the end of the month, not the start of it.
// The last Thursday leaves a few days to finish before the month closes.
const SELF_AUDIT_DOW = 4;
const CORP_MONTHS = [3, 6, 9, 12];   // corporate inspection: due in the last month of each quarter
const CORP_DOM = 1;                  // asked for at the start of that month

const STORES = ['Fort Stockton', 'Corpus Christi'];
const GM_BY_STORE = { 'Fort Stockton': 'Karina', 'Corpus Christi': 'Bryan' };
const HOOKS = {
  'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON,
  'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS
};
const ROTATION_PATH = 'schedule/spot-rotation.json';

const daysBetween = (isoA, isoB) =>
  Math.round((Date.parse(isoA + 'T00:00:00Z') - Date.parse(isoB + 'T00:00:00Z')) / 86400000);
const quarterOf = m => Math.floor((m - 1) / 3) + 1;

const link = (store, type, sections) =>
  PUBLIC_BASE + '/kb-qsc-form.html?new=1&store=' + encodeURIComponent(store) +
  '&type=' + encodeURIComponent(type) +
  (sections && sections.length ? '&sections=' + sections.join(',') : '');

// Slack renders <url|label> as just the label. A raw link here unfurls into a
// screenful of query string on a phone, which buries the ask above it.
const startHere = (store, type, sections) => 'Start <' + link(store, type, sections) + '|here>';

// What is today asking for? One answer for the whole company, not one per store:
// both stores get the same ask on the same day, which is the only way a spot check
// is a fair comparison between them.
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function kindFor(T) {
  if (T.dow === NEVER_DOW) return 'none';                       // inventory day
  // The quarterly ask wants the 1st, but slides off a Tuesday rather than skipping.
  if (CORP_MONTHS.indexOf(T.m) >= 0) {
    const firstIsTuesday = new Date(Date.UTC(T.y, T.m - 1, 1)).getUTCDay() === NEVER_DOW;
    if (T.d === (firstIsTuesday ? CORP_DOM + 1 : CORP_DOM)) return 'quarterly';
  }
  // Last <SELF_AUDIT_DOW> of the month: that weekday, with no room for another one.
  if (T.dow === SELF_AUDIT_DOW && T.d + 7 > daysInMonth(T.y, T.m)) return 'monthly';
  if (SPOT_DOWS.indexOf(T.dow) >= 0) return 'spot';
  return 'none';
}

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    // Posting is for the cron. A person opening this URL gets a preview of what
    // today would send and nothing lands in Slack — add ?send=1 to actually post.
    const ua = String((req.headers && req.headers['user-agent']) || '');
    const send = /vercel-cron/i.test(ua) || q.send === '1';
    const T = todayCentral(q.date);
    // ?kind=spot|monthly|quarterly fires that ask regardless of the calendar, and
    // regardless of what was done recently — for a deliberate "send it now".
    const forced = ['spot', 'monthly', 'quarterly'].indexOf(String(q.kind || '')) >= 0 ? String(q.kind) : '';
    const kind = forced || kindFor(T);

    // What has each store actually done? One pass over the audits.
    const { blobs } = await list({ prefix: 'audits/' });
    const recs = (await Promise.all(blobs.map(async b => { try { return await readBlob(b.url); } catch (e) { return null; } })))
      .filter(Boolean).filter(r => !r.deleted);
    const lastOf = (store, type) => recs
      .filter(r => r.store === store && r.type === type && r.date)
      .map(r => r.date).sort().pop() || '';

    // One rotation for the company, so the ask is identical at both stores even
    // when one of them gets skipped for having already done it.
    let rot = { index: 0 };
    try {
      const f = await list({ prefix: ROTATION_PATH });
      if (f.blobs.length) {
        const prev = await readBlob(f.blobs[0].url).catch(() => null);
        if (prev && Number.isInteger(prev.index)) rot = prev;
      }
    } catch (e) {}
    const picks = [];
    for (let k = 0; k < SPOT_SECTIONS; k++) picks.push(SPOT_ROTATION[(rot.index + k) % SPOT_ROTATION.length]);

    const plan = [];
    for (const store of STORES) {
      const gm = GM_BY_STORE[store] || '';
      if (!HOOKS[store]) { plan.push({ store, kind: 'none', skipped: 'no Slack channel configured' }); continue; }

      if (kind === 'quarterly') {
        const last = lastOf(store, 'Quarterly Review');
        const done = last && +last.slice(0, 4) === T.y && quarterOf(+last.slice(5, 7)) === quarterOf(T.m);
        if (done && !forced) { plan.push({ store, kind, skipped: 'already done this quarter (' + last + ')' }); continue; }
        plan.push({
          store, kind,
          text: '🗓️ *' + store + ' — corporate inspection due this quarter*\n' +
                (gm ? gm + ', the' : 'The') + ' corporate-assisted Quarterly Review has to happen before the quarter closes. ' +
                'Get a date on the calendar with Dave.\n' +
                startHere(store, 'Quarterly Review')
        });
      } else if (kind === 'monthly') {
        const last = lastOf(store, 'Self-Audit');
        const done = last && last.slice(0, 7) === T.iso.slice(0, 7);
        if (done && !forced) { plan.push({ store, kind, skipped: 'already done this month (' + last + ')' }); continue; }
        plan.push({
          store, kind,
          text: '📋 *' + store + ' — monthly self-audit*\n' +
                (gm ? gm + ', this' : 'This') + " month's full QSC is due — all twelve sections, photo on each.\n" +
                startHere(store, 'Self-Audit')
        });
      } else if (kind === 'spot') {
        const last = lastOf(store, 'Spot Check');
        // Only silence for one already done today or yesterday. A wider window
        // would let Tuesday's check suppress Friday's ask.
        if (last && daysBetween(T.iso, last) <= 1 && !forced) {
          plan.push({ store, kind, skipped: 'spot check already done ' + last });
          continue;
        }
        plan.push({
          store, kind, sections: picks,
          text: '🔍 *' + store + ' — spot check*\n' +
                (gm ? gm + ', two' : 'Two') + ' sections today: *' + picks.map(titleOf).join('* and *') + '*.\n' +
                startHere(store, 'Spot Check', picks)
        });
      } else {
        plan.push({ store, kind: 'none', skipped: 'nothing scheduled today' });
      }
    }

    const posted = [];
    if (send) {
      for (const p of plan) {
        if (!p.text) continue;
        try {
          await fetch(HOOKS[p.store], {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: p.text })
          });
          posted.push(p.store + ':' + p.kind);
        } catch (e) {}
      }
      // Advance once, not once per store, and only if a spot ask actually went out.
      if (posted.some(x => x.endsWith(':spot'))) {
        rot = { index: (rot.index + SPOT_SECTIONS) % SPOT_ROTATION.length, at: new Date().toISOString() };
        await put(ROTATION_PATH, JSON.stringify(rot), {
          access: 'public', contentType: 'application/json',
          addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
        });
      }
    }

    res.status(200).json({ ok: true, date: T.iso, dow: T.dow, kind, forced: !!forced, sent: send, posted, plan, rotation: rot });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
