/**
 * Public pages served by the Worker, styled to match 3nuggets.io.
 *
 * Airtable requires a privacy policy URL and a terms of service URL on an OAuth
 * integration before anyone other than its owner may authorize it, so the server
 * hosts its own — no separate website needed. They are also what users read on the
 * consent screen, so they carry the same identity as the rest of the brand.
 *
 * Design tokens and type stack are taken from 3nuggets.io (operator.css).
 */

const BRAND = "3nuggets";
const BRAND_URL = "https://3nuggets.io";
const CONTACT = "dimitris@3nuggets.io";
const UPDATED = "18 August 2026";
const SERVICE = "Airtable MCP";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,800;0,9..144,900;1,9..144,500;1,9..144,600;1,9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";

const STYLES = `
:root{
  --bg:#f4ede0; --surface:#e9e0cd; --line:rgba(22,17,6,.14); --line-strong:rgba(22,17,6,.26);
  --ink:#161106; --muted:rgba(22,17,6,.66);
  --accent:#e0a24a; --accent-deep:#b87a32; --accent-fg:#161106; --accent-2:#d64321;
  --accent-wash:rgba(224,162,74,.14);
  --panel-bg:#161106; --panel-fg:#f4ede0; --term-bg:#0c0a06;
  --header-bg:rgba(244,237,224,.85);
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --bg:#0c0d0a; --surface:#15170f; --line:rgba(238,241,227,.16); --line-strong:rgba(238,241,227,.28);
    --ink:#eef1e3; --muted:rgba(238,241,227,.72);
    --accent:#c6f24e; --accent-deep:#a9d63a; --accent-fg:#0c0d0a; --accent-2:#ff6a3d;
    --accent-wash:rgba(198,242,78,.12);
    --panel-bg:#14160f; --panel-fg:#eef1e3; --term-bg:#070804;
    --header-bg:rgba(12,13,10,.85);
  }
}
:root[data-theme="dark"]{
  --bg:#0c0d0a; --surface:#15170f; --line:rgba(238,241,227,.16); --line-strong:rgba(238,241,227,.28);
  --ink:#eef1e3; --muted:rgba(238,241,227,.72);
  --accent:#c6f24e; --accent-deep:#a9d63a; --accent-fg:#0c0d0a; --accent-2:#ff6a3d;
  --accent-wash:rgba(198,242,78,.12);
  --panel-bg:#14160f; --panel-fg:#eef1e3; --term-bg:#070804;
  --header-bg:rgba(12,13,10,.85);
}

*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0; background:var(--bg); color:var(--ink);
  font:400 16px/1.68 "Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased;
}

.topbar{
  position:sticky; top:0; z-index:10;
  background:var(--header-bg); backdrop-filter:saturate(140%) blur(10px);
  border-bottom:1px solid var(--line);
}
.topbar-in{
  max-width:46rem; margin:0 auto; padding:.85rem 1.25rem;
  display:flex; align-items:baseline; gap:.65rem; flex-wrap:wrap;
}
.wordmark{
  font-family:"Fraunces",Georgia,serif; font-optical-sizing:auto;
  font-weight:800; font-size:1.12rem; letter-spacing:-.015em;
  color:var(--ink); text-decoration:none;
}
.wordmark:hover{color:var(--accent-deep)}
.crumb{
  font-family:"JetBrains Mono",ui-monospace,monospace;
  font-size:.74rem; letter-spacing:.06em; text-transform:uppercase; color:var(--muted);
}

.wrap{max-width:46rem; margin:0 auto; padding:3.25rem 1.25rem 5rem}

h1{
  font-family:"Fraunces",Georgia,serif; font-optical-sizing:auto;
  font-weight:700; font-size:clamp(2rem,1.5rem+2.2vw,2.7rem); line-height:1.1;
  letter-spacing:-.02em; margin:0 0 .5rem; text-wrap:balance;
}
h2{
  font-family:"Fraunces",Georgia,serif; font-optical-sizing:auto;
  font-weight:600; font-size:1.3rem; line-height:1.25; letter-spacing:-.01em;
  margin:2.4rem 0 .5rem; text-wrap:balance;
}
h3{font-weight:600; font-size:1rem; margin:1.6rem 0 .35rem}
p,li{margin:.65rem 0}
.lede{color:var(--muted); font-size:1.05rem; margin:0 0 2rem; max-width:36rem}
ul{padding-left:1.15rem}
li{margin:.4rem 0}
a{color:var(--accent-deep); text-underline-offset:.18em}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) a{color:var(--accent)}}
:root[data-theme="dark"] a{color:var(--accent)}
a:focus-visible{outline:2px solid var(--accent); outline-offset:3px; border-radius:3px}

code{
  font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.87em;
  background:var(--surface); border:1px solid var(--line); border-radius:5px;
  padding:.1em .38em; overflow-wrap:anywhere;
}
.callout{
  background:var(--surface); border:1px solid var(--line);
  border-left:3px solid var(--accent); border-radius:0 12px 12px 0;
  padding:1.1rem 1.25rem; margin:1.75rem 0;
}
.callout p{margin:.35rem 0}
.callout .label{
  font-family:"JetBrains Mono",ui-monospace,monospace;
  font-size:.7rem; letter-spacing:.11em; text-transform:uppercase; color:var(--muted);
  display:block; margin-bottom:.4rem;
}
.url{
  font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.92rem;
  color:var(--ink); user-select:all; overflow-wrap:anywhere; display:block;
}
.steps{list-style:none; padding:0; counter-reset:s}
.steps li{
  counter-increment:s; position:relative; padding-left:2.1rem; margin:.85rem 0;
}
.steps li::before{
  content:counter(s); position:absolute; left:0; top:.05rem;
  font-family:"JetBrains Mono",ui-monospace,monospace; font-size:.72rem; font-weight:600;
  width:1.5rem; height:1.5rem; display:grid; place-items:center;
  background:var(--accent-wash); color:var(--accent-deep); border-radius:6px;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .steps li::before{color:var(--accent)}}
:root[data-theme="dark"] .steps li::before{color:var(--accent)}

footer{
  margin-top:3.5rem; padding-top:1.35rem; border-top:1px solid var(--line);
  color:var(--muted); font-size:.875rem;
}
footer nav{display:flex; gap:1.1rem; flex-wrap:wrap; margin-bottom:.6rem}
.tagline{font-family:"Fraunces",Georgia,serif; font-style:italic; font-weight:500}
`;

const layout = (title: string, crumb: string, body: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title === SERVICE ? `${SERVICE} · ${BRAND}` : `${title} · ${SERVICE}`}</title>
<meta name="description" content="${SERVICE} by ${BRAND} — connect Claude to your own Airtable account.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>
<div class="topbar"><div class="topbar-in">
  <a class="wordmark" href="${BRAND_URL}">${BRAND}</a>
  <span class="crumb">${crumb}</span>
</div></div>
<div class="wrap">
${body}
<footer>
  <nav>
    <a href="/">Home</a>
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="${BRAND_URL}">${BRAND}.io</a>
    <a href="mailto:${CONTACT}">Contact</a>
  </nav>
  <div class="tagline">We build it together. You own it.</div>
  <div style="margin-top:.35rem">Last updated ${UPDATED}</div>
</footer>
</div>
</body></html>`;

const html = (title: string, crumb: string, body: string) =>
  new Response(layout(title, crumb, body), {
    // Short TTL: these are policy pages that may need correcting, and a long edge
    // cache makes edits look like they did not deploy.
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });

export function landingPage(origin: string): Response {
  return html(
    SERVICE,
    "Airtable MCP",
    `<h1>Claude, connected to your Airtable</h1>
<p class="lede">Read and write records, manage tables and comments, and move documents in and out of attachment fields — all from a conversation, using your own Airtable account.</p>

<div class="callout">
  <span class="label">Connect with this URL</span>
  <span class="url">${origin}/mcp</span>
</div>

<h2>Getting connected</h2>
<ol class="steps">
  <li>In Claude, open <strong>Settings → Connectors</strong> and choose <strong>Add custom connector</strong>. On Claude Code, run <code>claude mcp add --transport http airtable ${origin}/mcp</code></li>
  <li>Paste the URL above and click <strong>Connect</strong>.</li>
  <li>Sign in to Airtable and approve the permissions. That's it — nothing to configure.</li>
</ol>
<p>You are only ever connected to your own Airtable account, and you can disconnect whenever you like from your Airtable settings.</p>

<h2>What you can ask for</h2>
<ul>
  <li>Find, filter and update records across your bases</li>
  <li>Create tables and fields, or read how a base is put together</li>
  <li>Read and write comments on records</li>
  <li>Upload a document into an attachment field, or pull one back out</li>
  <li>Set up and manage webhooks</li>
</ul>

<h2>It keeps nothing</h2>
<p>This service runs your requests and holds on to none of it. No records, no documents, no credentials — there's no database here to put them in. The <a href="/privacy">privacy policy</a> spells out exactly what that means.</p>

<h2>Worth knowing</h2>
<ul>
  <li>Uploads are capped at <strong>5 MB</strong> per file. That's Airtable's own API limit, not ours.</li>
  <li>Claude Code handles file uploads most reliably, because it reads the real file from your machine.</li>
</ul>`,
  );
}

export function privacyPage(origin: string): Response {
  return html(
    "Privacy",
    "Privacy Policy",
    `<h1>Privacy Policy</h1>
<p class="lede">${SERVICE}, operated by ${BRAND}. Last updated ${UPDATED}.</p>

<p>This service connects Claude to your Airtable account. It's built so it doesn't keep your information: it carries out the request you asked for, then holds on to nothing.</p>

<h2>What we don't store</h2>
<p>There is no database, no file storage and no session storage behind this service. Specifically, we do not keep:</p>
<ul>
  <li><strong>Your Airtable content.</strong> Records, tables, comments and schema pass between Claude and Airtable. They are never written down or cached here.</li>
  <li><strong>Your documents.</strong> Files you upload go straight to Airtable and are discarded. Downloads are served by Airtable's own temporary links.</li>
  <li><strong>Your credentials.</strong> The access you grant at sign-in is encrypted and held by <em>your</em> Claude client, not by us. There is no account or token table here.</li>
  <li><strong>Request logs.</strong> Application logging is switched off, so request contents and URLs are not retained.</li>
</ul>

<h2>What happens during a request</h2>
<p>Your Claude client sends the encrypted authorization it holds. We decrypt it in memory, call the Airtable API on your behalf, hand back the result, and drop everything. That's the entire lifespan of your data here — the length of one request.</p>

<h2>The permissions you grant</h2>
<p>When you sign in, Airtable shows you exactly what's being asked for: reading and writing records and comments, reading and writing base schema, managing webhooks, and your account email. We can only ever do what you approved, and only inside your own Airtable account. We cannot see anyone else's data, and no one else can see yours.</p>

<h2>Third parties</h2>
<ul>
  <li><strong>Airtable</strong> — your data lives there, under <a href="https://www.airtable.com/company/privacy" rel="noopener">Airtable's privacy policy</a>.</li>
  <li><strong>Cloudflare</strong> — the service runs on Cloudflare Workers, which handles the network traffic. We store no application data there.</li>
  <li><strong>Google Fonts</strong> — these pages load fonts from Google, which sees the request. The connector itself does not.</li>
</ul>
<p>We don't sell or share your information, and we don't use it for advertising, analytics, profiling or training models.</p>

<h2>Disconnecting</h2>
<p>You can revoke access any time in your Airtable account settings, under third-party integrations. Because nothing is stored here, revoking is immediate and complete — there's no leftover copy to delete.</p>

<h2>Your rights</h2>
<p>Rights of access, correction, deletion and portability apply to personal data a service holds. We hold none, so those requests are best pointed at Airtable, which holds your content. Happy to help you work out where to send something — just ask.</p>

<h2>Children</h2>
<p>This service isn't directed at children under 16 and shouldn't be used by them.</p>

<h2>Changes</h2>
<p>If this policy changes, the new version goes up at <code>${origin}/privacy</code> with a fresh date.</p>

<h2>Get in touch</h2>
<p>Questions about any of this: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`,
  );
}

export function termsPage(origin: string): Response {
  return html(
    "Terms",
    "Terms of Service",
    `<h1>Terms of Service</h1>
<p class="lede">${SERVICE}, operated by ${BRAND}. Last updated ${UPDATED}.</p>

<h2>1. What this service is</h2>
<p>${SERVICE} lets an AI assistant that supports the Model Context Protocol work in your Airtable account on your behalf — reading and writing records, comments and schema, managing webhooks, and moving attachments in and out. Connecting it means you accept these terms.</p>

<h2>2. Your Airtable account</h2>
<p>You need your own Airtable account, and the right to access the data you point this at. The service acts strictly within the permissions you approve at sign-in, and you can revoke them at any time from your Airtable settings. Your use of Airtable itself stays governed by your agreement with Airtable.</p>

<h2>3. Fair use</h2>
<p>Don't use the service to break the law, infringe anyone's rights, reach data you're not entitled to, upload malware, or put unreasonable load on this service or Airtable's API. Automated use needs to respect Airtable's rate limits.</p>

<h2>4. Actions taken by an AI assistant</h2>
<p>The service carries out instructions that come through your AI assistant, and some of those change or delete data. Review what you're approving before you approve it. You're responsible for the outcome of the requests you authorize, and you should keep your own backups of anything important.</p>

<h2>5. Availability</h2>
<p>This is provided free and with no promise of availability. It can change, pause or stop at any time without notice. It also depends on Airtable and Cloudflare, so their outages and changes affect it too.</p>

<h2>6. No warranty</h2>
<p>The service is provided "as is" and "as available", without warranties of any kind, express or implied, including fitness for a particular purpose, accuracy, and non-infringement.</p>

<h2>7. Limits of liability</h2>
<p>To the fullest extent the law allows, ${BRAND} is not liable for indirect, incidental, special or consequential damages, or for loss of data, revenue or profits arising from your use of the service. Nothing here excludes liability that can't lawfully be excluded.</p>

<h2>8. Privacy</h2>
<p>The <a href="/privacy">privacy policy</a> covers what this service does and doesn't keep. Short version: no records, no documents, no credentials.</p>

<h2>9. Changes to these terms</h2>
<p>Updated terms go up at <code>${origin}/terms</code> with a new date. Carrying on using the service after a change means you're happy with it.</p>

<h2>10. Get in touch</h2>
<p><a href="mailto:${CONTACT}">${CONTACT}</a></p>`,
  );
}
