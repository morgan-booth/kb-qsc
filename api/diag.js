import { put, list } from '@vercel/blob';

// Self-test for the QSC backend. Visit /api/diag in a browser.
export default async function handler(req, res) {
  const out = [];
  out.push('BLOB_READ_WRITE_TOKEN present: ' + (!!process.env.BLOB_READ_WRITE_TOKEN));

  try {
    const listed = await list({ prefix: 'audits/' });
    out.push('list() OK - existing audits: ' + listed.blobs.length);
  } catch (e) {
    out.push('list() FAILED: ' + String(e));
  }

  try {
    const r = await put('diag/test-' + Date.now() + '.txt', 'hello from diag', {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false
    });
    out.push('put() OK - url: ' + r.url);
  } catch (e) {
    out.push('put() FAILED: ' + String(e));
  }

  out.push('SLACK_WEBHOOK_URL env var set: ' + (!!process.env.SLACK_WEBHOOK_URL));
  try {
    const hook = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/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';
    const sr = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'QSC diagnostic - Slack webhook is connected.' })
    });
    const body = await sr.text();
    out.push('slack POST status: ' + sr.status + ' - response: ' + body);
  } catch (e) {
    out.push('slack POST FAILED: ' + String(e));
  }

  const esc = function (s) { return String(s).split('&').join('&amp;').split('<').join('&lt;'); };
  const rows = out.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send('<html><body style="font-family:monospace;font-size:15px;padding:16px"><h3>QSC backend diagnostic</h3>' + rows + '</body></html>');
}
