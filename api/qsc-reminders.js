import { list, put } from '@vercel/blob';
import { readBlob } from './_blob.js';
import { PUBLIC_BASE } from './_site.js';
import { SPOT_ROTATION, titleOf } from './_sections.js';

export const config = { maxDuration: 60 };

// Scheduled QSC reminders (Vercel Cron, once a day).
//
// These used to be scheduled drafts written by hand in Slack. The app already
// knows what has actually been inspected, so it can ask for the work itself —
// and, more usefully, stay quiet when the work is already done. A reminder for
// something a manager finished yesterday is how people learn to ignore reminders.
//
// The whole cadence lives here so it can be changed in one place.
const SPOT_DOWS = [2, 5];            // spot check: Tuesday and Friday
const SPOT_SECTIONS = 2;             // two sections each time
const SELF_AUDIT_DOW = 2;            // full self-audit: the first Tuesday of the month
const CORP_MONTHS = [3, 6, 9, 12];   // corporate inspection: due in the last month of each quarter
const CORP_DOM = 1;                  // asked for on the 1st of that month

const STORES = ['Fort Stockton', 'Corpus Christi', 'Ruidoso'];
const GM_BY_STORE = { 'Fort Stockton': 'Karina', 'Corpus Christi': 'Bryan', 'Ruidoso': 'Bryan Sullivan' };
const HOOKS = {
  'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON,
  'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS,
  'Ruidoso': process.env.SLACK_WEBHOOK_RUIDOSO
};
const ROTATION_PATH = 'schedule/spot-rotation.json';

// The stores are on Central time; Vercel cron fires in UTC. Ask the clock in Texas
// what day it is, or a morning reminder lands on the wrong day half the year.
function todayCentral() {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date());
  const get = t => (p.find(x => x.type === t) || {}).value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return { y: +get('year'), m: +get('month'), d: +get('day'), dow, iso: get('year') + '-' + get('month') + '-' + get('day') };
}

const daysBetween = (isoA, isoB) =>
  Math.round((Date.parse(isoA + 'T00:00:00Z') - Date.parse(isoB + 'T00:00:00Z')) / 86400000);
const quarterOf = m => Math.floor((m - 1) / 3) + 1;

const link = (store, type, sections) =>
  PUBLIC_BASE + '/kb-qsc-form.html?new=1&store=' + encodeURIComponent(store) +
  '&type=' + encodeURIComponent(type) +
  (sections && sections.length ? '&sections=' + sections.join(',') : '');

export default async function handler(req, res) {
  try {
    const q = req.query || {};
    // Posting is for the cron. A person opening this URL gets a preview of what
    // today would send and nothing lands in Slack — add ?send=1 to actually post.
    const ua = String((req.headers && req.headers['user-agent']) || '');
    const send = /vercel-cron/i.test(ua) || q.send === '1';
    const T = q.date ? { ...todayCentral(), iso: String(q.date) } : todayCentral();
    if (q.date) {
      const d = new Date(String(q.date) + 'T12:00:00Z');
      T.y = d.getUTCFullYear(); T.m = d.getUTCMonth() + 1; T.d = d.getUTCDate(); T.dow = d.getUTCDay();
    }

    // What has each store actually done? One pass over the audits.
    const { blobs } = await list({ prefix: 'audits/' });
    const recs = (await Promise.all(blobs.map(async b => { try { return await readBlob(b.url); } catch (e) { return null; } })))
      .filter(Boolean).filter(r => !r.deleted);
    const lastOf = (store, type) => recs
      .filter(r => r.store === store && r.type === type && r.date)
      .map(r => r.date).sort().pop() || '';

    let rot = {};
    try {
      const f = await list({ prefix: ROTATION_PATH });
      if (f.blobs.length) rot = (await readBlob(f.blobs[0].url).catch(() => null)) || {};
    } catch (e) {}

    const plan = [];
    for (const store of STORES) {
      const gm = GM_BY_STORE[store] || '';
      const hook = HOOKS[store];
      // A store with no channel configured (Ruidoso today) is simply not reminded.
      if (!hook) { plan.push({ store, kind: 'none', skipped: 'no Slack channel configured' }); continue; }

      // ---- quarterly corporate-assisted inspection --------------------------
      if (CORP_MONTHS.indexOf(T.m) >= 0 && T.d === CORP_DOM) {
        const last = lastOf(store, 'Quarterly Review');
        const doneThisQuarter = last && +last.slice(0, 4) === T.y && quarterOf(+last.slice(5, 7)) === quarterOf(T.m);
        if (doneThisQuarter) plan.push({ store, kind: 'quarterly', skipped: 'already done this quarter (' + last + ')' });
        else plan.push({
          store, kind: 'quarterly',
          text: '🗓️ *' + store + ' — corporate inspection due this quarter*\n' +
                (gm ? gm + ', the' : 'The') + ' corporate-assisted Quarterly Review has to happen before the quarter closes. ' +
                'Get a date on the calendar with Dave.\n' +
                'Start it → ' + link(store, 'Quarterly Review')
        });
        continue;   // one ask a day per store — the quarterly one outranks the rest
      }

      // ---- monthly full self-audit -----------------------------------------
      if (T.dow === SELF_AUDIT_DOW && T.d <= 7) {
        const last = lastOf(store, 'Self-Audit');
        const doneThisMonth = last && last.slice(0, 7) === T.iso.slice(0, 7);
        if (doneThisMonth) plan.push({ store, kind: 'monthly', skipped: 'already done this month (' + last + ')' });
        else plan.push({
          store, kind: 'monthly',
          text: '📋 *' + store + ' — monthly self-audit*\n' +
                (gm ? gm + ', this' : 'This') + " month's full QSC is due — all twelve sections, photo on each.\n" +
                'Start it → ' + link(store, 'Self-Audit')
        });
        continue;
      }

      // ---- the twice-weekly spot check -------------------------------------
      if (SPOT_DOWS.indexOf(T.dow) >= 0) {
        const last = lastOf(store, 'Spot Check');
        // Only silence for one already done today or yesterday. A wider window
        // would let Tuesday's check suppress Friday's ask.
        if (last && daysBetween(T.iso, last) <= 1) {
          plan.push({ store, kind: 'spot', skipped: 'spot check already done ' + last });
          continue;
        }
        const i = Number.isInteger(rot[store]) ? rot[store] : 0;
        const picks = [];
        for (let k = 0; k < SPOT_SECTIONS; k++) picks.push(SPOT_ROTATION[(i + k) % SPOT_ROTATION.length]);
        plan.push({
          store, kind: 'spot', sections: picks, nextIndex: (i + SPOT_SECTIONS) % SPOT_ROTATION.length,
          text: '🔍 *' + store + ' — spot check*\n' +
                (gm ? gm + ', two' : 'Two') + ' sections today: *' + picks.map(titleOf).join('* and *') + '*.\n' +
                'Start it → ' + link(store, 'Spot Check', picks)
        });
        continue;
      }

      plan.push({ store, kind: 'none', skipped: 'nothing scheduled today' });
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
          if (p.kind === 'spot') rot[p.store] = p.nextIndex;   // only advance what actually went out
        } catch (e) {}
      }
      if (posted.some(x => x.endsWith(':spot'))) {
        await put(ROTATION_PATH, JSON.stringify(rot), {
          access: 'public', contentType: 'application/json',
          addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 0
        });
      }
    }

    res.status(200).json({ ok: true, date: T.iso, dow: T.dow, sent: send, posted, plan, rotation: rot });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
