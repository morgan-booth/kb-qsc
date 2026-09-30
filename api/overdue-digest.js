import { list } from '@vercel/blob';
import { PUBLIC_BASE } from './_site.js';
import { readBlob } from './_blob.js';
import { workTypeOf, familyOf } from './_worktype.js';
import { todayCentral } from './_when.js';

export const config = { maxDuration: 60 };

// Overdue digest (Vercel Cron, daily).
//
// Cleaning and repairs are not the same kind of debt and should not be chased at
// the same rate. A dirty floor is a deliverable — it can be fixed today, and it is
// how the restaurant looks to a guest tonight, so it gets asked for every day. A
// broken door closer waits on a part or a trade; asking daily just teaches people
// to scroll past the message. Repairs go out twice a week instead.
const REPAIR_DOWS = [1, 4];   // repairs digest: Monday and Thursday
export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'audits/' });
    const recs = await Promise.all(blobs.map(async b => { try { return await readBlob(b.url); } catch (e) { return null; } }));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const seen = {};
    recs.filter(Boolean).filter(r => !r.deleted).forEach(r => {
      (r.items || []).forEach(it => {
        if (it.capital) return;
        if (it.mark !== 'attn' && it.mark !== 'rep') return;
        if (it.resolved || it.itemStatus === 'done') return;
        if (it.itemStatus === 'ordered' || it.itemStatus === 'blocked') return;
        if (!it.fixBy) return;
        const d = new Date(it.fixBy + 'T00:00:00');
        if (isNaN(d.getTime()) || d >= today) return;
        const days = Math.round((today - d) / 86400000);
        const k = r.store + '::' + it.section + '::' + it.item;
        const family = familyOf(workTypeOf(it));
        if (!seen[k] || days > seen[k].days) seen[k] = { store: r.store, item: it.item, section: it.sectionTitle || ('Section ' + it.section), days: days, family: family };
      });
    });
    // Today only chases what today is for.
    const T = todayCentral(req.query && req.query.date);
    const repairDay = REPAIR_DOWS.indexOf(T.dow) >= 0;
    const byStore = {};
    Object.values(seen).forEach(e => {
      const cleaning = e.family === 'Cleaning';
      if (!cleaning && !repairDay) return;
      (byStore[e.store] = byStore[e.store] || []).push(e);
    });

    const HOOKS = { 'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON, 'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS, 'Ruidoso': process.env.SLACK_WEBHOOK_RUIDOSO };
    const def = process.env.SLACK_WEBHOOK_URL;
    const base = PUBLIC_BASE;   // never the request host — see api/_site.js
    const posted = [];
    for (const store of Object.keys(byStore)) {
      const items = byStore[store];
      const count = items.length;
      const maxDays = items.reduce((m, x) => Math.max(m, x.days), 0);
      const bySec = {};
      items.forEach(x => { bySec[x.section] = (bySec[x.section] || 0) + 1; });
      const top = Object.keys(bySec).sort((a, b) => bySec[b] - bySec[a]).slice(0, 3).map(sc => sc + ' (' + bySec[sc] + ')');
      const nClean = items.filter(x => x.family === 'Cleaning').length;
      const nRep = count - nClean;
      // Lead with cleaning, because that is the part that can be done today.
      const head = nClean && nRep
        ? nClean + ' cleaning item' + (nClean > 1 ? 's' : '') + ' and ' + nRep + ' repair' + (nRep > 1 ? 's' : '') + ' overdue'
        : (nClean ? nClean + ' cleaning item' + (nClean > 1 ? 's' : '') + ' overdue'
                  : nRep + ' repair' + (nRep > 1 ? 's' : '') + ' overdue');
      const text = '🔴 *' + store + ' — ' + head + '*\n' +
        'Up to ' + maxDays + ' day' + (maxDays === 1 ? '' : 's') + ' overdue' + (top.length ? ' · heaviest: ' + top.join(', ') : '') + '.\n' +
        'See the full list → ' + base + '/kb-qsc-punchlist.html?store=' + encodeURIComponent(store);
      const hook = HOOKS[store] || def;
      if (hook) { try { await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text }) }); posted.push(store + ':' + items.length); } catch (e) {} }
    }
    res.status(200).json({ ok: true, date: T.iso, repairDay, storesWithOverdue: Object.keys(byStore).length, posted: posted });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
