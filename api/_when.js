// The stores are on Central time; Vercel cron fires in UTC. Ask the clock in Texas
// what day it is, or a morning message lands on the wrong day half the year.
export function todayCentral(override) {
  if (override) {
    const d = new Date(String(override) + 'T12:00:00Z');
    if (!isNaN(d.getTime())) {
      const iso = d.toISOString().slice(0, 10);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), dow: d.getUTCDay(), iso };
    }
  }
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
  }).formatToParts(new Date());
  const get = t => (p.find(x => x.type === t) || {}).value;
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  return { y: +get('year'), m: +get('month'), d: +get('day'), dow, iso: get('year') + '-' + get('month') + '-' + get('day') };
}
