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
        const istat = it.itemStatus || (resolved ? 'done' : 'open');
        let status;
        if (resolved || istat === 'done') status = 'done';
        else if (istat === 'blocked') status = 'blocked';
        else if (istat === 'ordered') status = 'ordered';
        else if (it.fixBy) { const d = new Date(it.fixBy + 'T00:00:00'); status = (!isNaN(d.getTime()) && d < today) ? 'overdue' : 'open'; }
        else status = 'open';
        out.push({
          key: r.id + '::' + it.section + '::' + it.item,
          auditId: r.id, store: r.store || '', submittedBy: r.submittedBy || '', date: r.date || '', submittedAt: r.submittedAt || '',
          section: it.section, sectionTitle: it.sectionTitle || ('Section ' + it.section), item: it.item, mark: it.mark,
          note: it.note || '', fixBy: it.fixBy || '', photos: it.photos || [],
          resolved, resolvedAt: it.resolvedAt || '', resolvedBy: it.resolvedBy || '', afterPhotos: it.afterPhotos || [], resolveNote: it.resolveNote || '',
          materials: it.materials || '', itemStatus: istat, blockedReason: it.blockedReason || '', log: Array.isArray(it.log) ? it.log : [],
          status
        });
      });
    });
    // Corporate repairs recur across audits (long lead times) — collapse the same
    // store+section+item into ONE entry (the latest flag), tracking how long it's lingered.
    let rows = out;
    if (scope === 'capital') {
      const map = {};
      out.forEach(x => {
        const k = x.store + '||' + x.section + '||' + x.item;
        const g = map[k];
        if (!g) { map[k] = { rep: x, count: 1, firstAt: x.submittedAt || '9999', firstDate: x.date || '' }; }
        else {
          g.count += 1;
          if (String(x.submittedAt || '') > String(g.rep.submittedAt || '')) g.rep = x;   // representative = most recent flag
          if (String(x.submittedAt || '9999') < String(g.firstAt)) { g.firstAt = x.submittedAt || '9999'; g.firstDate = x.date || ''; }
        }
      });
      rows = Object.values(map).map(g => Object.assign({}, g.rep, { occurrences: g.count, firstSeen: g.firstDate }));
    }
    const store = req.query && req.query.store;
    let f = store ? rows.filter(x => x.store === store) : rows;
    const rank = { overdue: 0, blocked: 1, open: 2, ordered: 3, done: 4 };
    f.sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.fixBy || '9999-99-99').localeCompare(String(b.fixBy || '9999-99-99')));
    res.status(200).json(f);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
