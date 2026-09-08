// Vercel Blob serves overwritten files from the CDN, so a plain fetch of a blob
// URL can return a stale body long after the file changed. openitems.js and
// resolve.js already work around this per-call; this is the shared version.
//
// It matters most on read-modify-write paths (delete / restore / override /
// review): a stale read written back silently reverts everything saved since
// the CDN cached that copy — close-outs included.
export function bustUrl(url) {
  return url + (url.includes('?') ? '&' : '?') + '_=' + Date.now();
}
export async function readBlob(url) {
  return await (await fetch(bustUrl(url), { cache: 'no-store' })).json();
}
