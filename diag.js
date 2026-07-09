import { put, list } from '@vercel/blob';

// Plain-text self-test for Vercel Blob. Visit /api/diag in a browser.
export default async function handler(req, res) {
  const out = [];
  out.push('BLOB_READ_WRITE_TOKEN present: ' + (!!process.env.BLOB_READ_WRITE_TOKEN));
  try {
    const { blobs } = await list({ prefix: 'audits/' });
    out.push('list() OK — existing audits: ' + blobs.length);
  } catch (e) {
    out.push('list() FAILED: ' + String(e));
  }
  try {
    const r = await put(`diag/test-${Date.now()}.txt`, 'hello from diag', {
      access: 'public',
      contentType: 'text/plain',
      addRandomSuffix: false
    });
    out.push('put() OK — url: ' + r.url);
  } catch (e) {
    out.push('put() FAILED: ' + String(e));
  }
  // Slack webhook test (drops a real test message if it works)
  out.push('SLACK_WEBHOOK_URL env var set: ' + (!!process.env.SLACK_WEBHOOK_URL));
  try {
    const hook = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/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';
    const sr = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "✅ K-BOB'S QSC diagnostic — Slack webhook is connected." })
    });
    const body = await sr.text();
    out.push('slack POST status: ' + sr.status + ' — response: ' + body);
  } catch (e) {
    out.push('slack POST FAILED: ' + String(e));
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send(out.join('\n'));
}
