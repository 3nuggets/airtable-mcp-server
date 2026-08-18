/**
 * Public pages served by the Worker.
 *
 * Airtable requires a privacy policy URL and a terms of service URL on an OAuth
 * integration before anyone other than its owner may authorize it, so the server
 * hosts its own — no separate website needed. They are also what users read on the
 * consent screen, so they describe the zero-retention design plainly.
 */

const OPERATOR = "3Nuggets";
const CONTACT = "dimitris@3nuggets.io";
const UPDATED = "18 August 2026";
const SERVICE = "Airtable MCP Server";

const layout = (title: string, body: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title === SERVICE ? SERVICE : `${title} — ${SERVICE}`}</title>
<style>
  :root{--bg:#fff;--fg:#1a1a1a;--muted:#5c5c5c;--line:#e3e3e3;--accent:#2563eb;--code:#f5f5f5}
  @media (prefers-color-scheme:dark){
    :root{--bg:#131313;--fg:#ededed;--muted:#a1a1a1;--line:#2c2c2c;--accent:#7ba7ff;--code:#1e1e1e}
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
    font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .wrap{max-width:44rem;margin:0 auto;padding:3rem 1.25rem 5rem}
  h1{font-size:1.9rem;line-height:1.2;margin:0 0 .4rem}
  h2{font-size:1.15rem;margin:2.2rem 0 .6rem}
  p,li{color:var(--fg)}
  .lede{color:var(--muted);margin:0 0 2rem}
  ul{padding-left:1.15rem}li{margin:.35rem 0}
  code{background:var(--code);padding:.15em .4em;border-radius:4px;font-size:.9em;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;word-break:break-all}
  a{color:var(--accent)}
  .box{border:1px solid var(--line);border-radius:10px;padding:1rem 1.25rem;margin:1.5rem 0}
  footer{margin-top:3rem;padding-top:1.25rem;border-top:1px solid var(--line);
    color:var(--muted);font-size:.875rem}
  footer a{margin-right:1rem}
</style></head>
<body><div class="wrap">${body}
<footer>
  <a href="/">Home</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
  <div style="margin-top:.6rem">Last updated ${UPDATED} · <a href="mailto:${CONTACT}">${CONTACT}</a></div>
</footer>
</div></body></html>`;

const html = (title: string, body: string) =>
  new Response(layout(title, body), {
    // Short TTL: these are policy pages that may need correcting, and a long edge
    // cache makes edits look like they did not deploy.
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });

export function landingPage(origin: string): Response {
  return html(
    "Airtable MCP Server",
    `<h1>${SERVICE}</h1>
<p class="lede">Connect Claude to your own Airtable account — read and write records, manage schema and comments, and upload or download documents.</p>

<div class="box">
  <strong>Connect using this URL</strong>
  <p style="margin:.5rem 0 0"><code>${origin}/mcp</code></p>
</div>

<h2>How to connect</h2>
<ul>
  <li><strong>claude.ai</strong> — Settings → Connectors → Add custom connector → paste the URL above.</li>
  <li><strong>Claude Desktop</strong> — Settings → Connectors → Add custom connector → same URL.</li>
  <li><strong>Claude Code</strong> — <code>claude mcp add --transport http airtable ${origin}/mcp</code></li>
</ul>
<p>You'll be sent to Airtable to sign in and approve access. You are only ever connected to <em>your own</em> Airtable account.</p>

<h2>What you can do</h2>
<ul>
  <li>Find, filter and update records across your bases</li>
  <li>Create tables and fields, and read base schema</li>
  <li>Read and write record comments</li>
  <li>Upload documents into attachment fields, and download them again</li>
  <li>Manage webhooks</li>
</ul>

<h2>This service stores nothing</h2>
<p>It runs your requests and keeps no copy of them. No records, no documents, and no credentials are retained — see the <a href="/privacy">privacy policy</a> for specifics.</p>

<h2>Good to know</h2>
<ul>
  <li>Uploads are limited to <strong>5 MB</strong> per file, which is Airtable's API limit.</li>
  <li>You can revoke access at any time from your Airtable account settings.</li>
</ul>`,
  );
}

export function privacyPage(origin: string): Response {
  return html(
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
<p class="lede">${SERVICE}, operated by ${OPERATOR}. Last updated ${UPDATED}.</p>

<p>This service connects Claude to your Airtable account. It is built so that it does not retain your information: it carries out the requests you ask for and keeps nothing afterwards.</p>

<h2>What the service does not store</h2>
<p>The service has no database, no file storage and no session storage of any kind. Specifically, it does not store:</p>
<ul>
  <li><strong>Your Airtable content</strong> — records, tables, comments and schema are passed between Claude and Airtable and are never written down or cached.</li>
  <li><strong>Your documents</strong> — files you upload are passed straight to Airtable and discarded; downloads are served by Airtable's own temporary links.</li>
  <li><strong>Your credentials</strong> — the access created when you sign in with Airtable is encrypted and held by <em>your</em> Claude client, not by this service. There is no account, session or token table here.</li>
  <li><strong>Request logs</strong> — application logging is disabled, so request contents and URLs are not retained.</li>
</ul>

<h2>What is processed, and when</h2>
<p>When you make a request, your Claude client sends the encrypted authorization it holds. The service decrypts it in memory, calls the Airtable API on your behalf, returns the result, and discards everything. This happens only while a request is being served.</p>

<h2>Permissions you grant</h2>
<p>When you sign in, Airtable shows you exactly what access is requested — reading and writing records and comments, reading and writing base schema, managing webhooks, and your account email. The service can only ever do what you approved, and only within your own Airtable account. It cannot see other users' data.</p>

<h2>Third parties</h2>
<ul>
  <li><strong>Airtable</strong> — your data lives in Airtable and is governed by <a href="https://www.airtable.com/company/privacy" rel="noopener">Airtable's privacy policy</a>.</li>
  <li><strong>Cloudflare</strong> — the service runs on Cloudflare Workers, which processes network traffic as infrastructure. No application data is stored there by this service.</li>
</ul>
<p>Your information is not sold, shared, or used for advertising, analytics, profiling or model training.</p>

<h2>Withdrawing access</h2>
<p>You can revoke access at any time in your Airtable account settings, under third-party integrations. Because nothing is stored here, revoking is immediate and complete — there is no residual copy to delete. If you would like confirmation of this in writing, contact us.</p>

<h2>Your rights</h2>
<p>Rights of access, correction, deletion and portability apply to the personal data a service holds. As this service holds none, those requests are best directed to Airtable, which holds your content. We are happy to help you interpret this — contact <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>

<h2>Children</h2>
<p>This service is not directed to children under 16 and should not be used by them.</p>

<h2>Changes</h2>
<p>If this policy changes, the updated version will be published at <code>${origin}/privacy</code> with a new date.</p>

<h2>Contact</h2>
<p>Questions about this policy: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`,
  );
}

export function termsPage(origin: string): Response {
  return html(
    "Terms of Service",
    `<h1>Terms of Service</h1>
<p class="lede">${SERVICE}, operated by ${OPERATOR}. Last updated ${UPDATED}.</p>

<h2>1. The service</h2>
<p>${SERVICE} lets an AI assistant that supports the Model Context Protocol act on your Airtable account on your behalf — reading and writing records, comments and schema, managing webhooks, and uploading or downloading attachments. By connecting it, you agree to these terms.</p>

<h2>2. Your Airtable account</h2>
<p>You need your own Airtable account and must have the right to access the data you use it with. The service acts strictly within the permissions you approve at sign-in and can be revoked by you at any time from your Airtable settings. Your use of Airtable remains governed by your agreement with Airtable.</p>

<h2>3. Acceptable use</h2>
<p>Do not use the service to break the law, infringe anyone's rights, access data you are not entitled to, upload malware, or place unreasonable load on the service or on Airtable's API. Automated use must respect Airtable's rate limits.</p>

<h2>4. Instructions given by an AI assistant</h2>
<p>The service carries out instructions issued through your AI assistant, including ones that change or delete data. Review actions before approving them. You are responsible for the consequences of the requests you authorize, and you should keep your own backups of important data.</p>

<h2>5. Availability</h2>
<p>The service is provided free of charge and with no guarantee of availability. It may be changed, suspended or discontinued at any time without notice. It also depends on Airtable and Cloudflare, and can be affected by their outages or changes.</p>

<h2>6. No warranty</h2>
<p>The service is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy, and non-infringement.</p>

<h2>7. Limitation of liability</h2>
<p>To the fullest extent permitted by law, ${OPERATOR} is not liable for any indirect, incidental, special or consequential damages, or for any loss of data, revenue or profits, arising from your use of the service. Nothing here excludes liability that cannot lawfully be excluded.</p>

<h2>8. Privacy</h2>
<p>The <a href="/privacy">privacy policy</a> explains what the service does and does not retain. In short: it stores no records, documents or credentials.</p>

<h2>9. Changes to these terms</h2>
<p>Updated terms will be published at <code>${origin}/terms</code> with a new date. Continuing to use the service after a change means you accept it.</p>

<h2>10. Contact</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>`,
  );
}
