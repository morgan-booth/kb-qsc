import { list } from '@vercel/blob';

export const config = { maxDuration: 60 };

// Daily digest (Vercel Cron): for each store, list punch-list items that are OVERDUE
// (past due, not done, not materials-ordered/escalated) and post to that store's Slack channel.
export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'audits/' });
    const recs = await Promise.all(blobs.map(async b => { try { return await (await fetch(b.url)).json(); } catch (e) { return null; } }));
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
        if (!seen[k] || days > seen[k].days) seen[k] = { store: r.store, item: it.item, section: it.sectionTitle || ('Section ' + it.section), days: days };
      });
    });
    const byStore = {};
    Object.values(seen).forEach(e => { (byStore[e.store] = byStore[e.store] || []).push(e); });

    const HOOKS = { 'Fort Stockton': process.env.SLACK_WEBHOOK_STOCKTON, 'Corpus Christi': process.env.SLACK_WEBHOOK_CORPUS, 'Ruidoso': process.env.SLACK_WEBHOOK_RUIDOSO };
    const def = process.env.SLACK_WEBHOOK_URL;
    const base = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'kb-qsc-8mca.vercel.app');
    const posted = [];
    for (const store of Object.keys(byStore)) {
      const items = byStore[store];
      const count = items.length;
      const maxDays = items.reduce((m, x) => Math.max(m, x.days), 0);
      const bySec = {};
      items.forEach(x => { bySec[x.section] = (bySec[x.section] || 0) + 1; });
      const top = Object.keys(bySec).sort((a, b) => bySec[b] - bySec[a]).slice(0, 3).map(sc => sc + ' (' + bySec[sc] + ')');
      const text = '🔴 *' + store + ' — ' + count + ' overdue punch-list item' + (count > 1 ? 's' : '') + '*\n' +
        'Up to ' + maxDays + ' day' + (maxDays === 1 ? '' : 's') + ' overdue' + (top.length ? ' · heaviest: ' + top.join(', ') : '') + '.\n' +
        'See the full list → ' + base + '/kb-qsc-punchlist.html?store=' + encodeURIComponent(store);
      const hook = HOOKS[store] || def;
      if (hook) { try { await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text }) }); posted.push(store + ':' + items.length); } catch (e) {} }
    }
    res.status(200).json({ ok: true, storesWithOverdue: Object.keys(byStore).length, posted: posted });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
