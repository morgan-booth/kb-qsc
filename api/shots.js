import { SHOTS, SHOTS_PER_VISIT, shotsFor } from './_shots.js';

export const config = { maxDuration: 10 };

// What proof shots a visit on ?date= asks for, per section.
//
// The form fetches this rather than carrying its own copy, so the wording and the
// rotation live in one file. If this call fails the form falls back to the old
// "N photos per section" rule — a manager mid-audit on a bad connection still gets
// a working form, just a less specific one.
export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const q = req.query || {};
    const date = String(q.date || new Date().toISOString().slice(0, 10));
    const perVisit = Math.max(1, Math.min(12, parseInt(q.per, 10) || SHOTS_PER_VISIT));

    const sections = {};
    Object.keys(SHOTS).forEach(n => {
      const picked = shotsFor(Number(n), date, perVisit);
      if (picked.length) sections[n] = picked;
    });

    // ?all=1 returns every shot, not just this visit's — for review and reference.
    if (q.all === '1') {
      const all = {};
      Object.keys(SHOTS).forEach(n => { all[n] = SHOTS[n]; });
      return res.status(200).json({ ok: true, date, perVisit, sections, all });
    }
    res.status(200).json({ ok: true, date, perVisit, sections });
  } catch (e) {
    res.status(200).json({ error: String(e) });
  }
}
