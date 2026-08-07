import { list } from '@vercel/blob';

// Aggregate every attention/repair item across all audits into one store punch-list,
// each tagged open / overdue / done based on its fix-by date and close-out state.
export default async function handler(req, res) {
  try {
    const { blobs } = await list({ prefix: 'audits/' });
    const recs = await Promise.all(blobs.map(async b => { try { return await (await fetch(b.url)).json(); } catch (e) { return null; } }));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const scope = req.query && req.query.scope;           // 'capital' => corporate repairs list
    const out = [];
    recs.filter(Boolean).filter(r => !r.deleted).forEach(r => {
      (r.items || []).forEach(it => {
        if (scope === 'capital') { if (!it.capital) return; } else { if (it.capital) return; }
        if (it.mark !== 'attn' && it.mark !== 'rep') return;
        const resolved = !!it.resolved;
        let status = 'open';
        if (resolved) status = 'done';
        else if (it.fixBy) { const d = new Date(it.fixBy + 'T00:00:00'); if (!isNaN(d.getTime()) && d < today) status = 'overdue'; }
        out.push({
          key: r.id + '::' + it.section + '::' + it.item,
          auditId: r.id, store: r.store || '', submittedBy: r.submittedBy || '', date: r.date || '', submittedAt: r.submittedAt || '',
          section: it.section, sectionTitle: it.sectionTitle || ('Section ' + it.section), item: it.item, mark: it.mark,
          note: it.note || '', fixBy: it.fixBy || '', photos: it.photos || [],
          resolved, resolvedAt: it.resolvedAt || '', resolvedBy: it.resolvedBy || '', afterPhotos: it.afterPhotos || [], resolveNote: it.resolveNote || '',
          status
        });
      });
    });
    const store = req.query && req.query.store;
    let f = store ? out.filter(x => x.store === store) : out;
    const rank = { overdue: 0, open: 1, done: 2 };
    f.sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.fixBy || '9999-99-99').localeCompare(String(b.fixBy || '9999-99-99')));
    res.status(200).json(f);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
