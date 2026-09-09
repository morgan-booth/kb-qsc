// The one public address for this app.
//
// Every shareable link used to be built from the incoming request's host, or from
// location.origin in the browser. Vercel gives each deployment its own permanent
// URL (kb-qsc-8mca-c7gqr5d0p-....vercel.app), frozen to that build forever — so a
// single request arriving on one of those produced Slack messages, texts and
// emails pointing at a snapshot of the app that never updates again. A manager
// following such a link sees an old build no matter how often they reload, which
// is exactly how a GM ended up without an Assign button that had shipped hours
// earlier.
//
// Links must outlive the deployment that generated them, so they are never derived
// from the request. Set PUBLIC_BASE_URL to move the app to a custom domain.
export const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://kb-qsc-8mca.vercel.app').replace(/\/+$/, '');
