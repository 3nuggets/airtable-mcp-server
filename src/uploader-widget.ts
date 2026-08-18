/**
 * The in-chat upload widget (an MCP App), rendered by the host as a sandboxed
 * iframe. Self-contained: no external scripts, styles or fonts.
 *
 * WHY THIS EXISTS
 * ---------------
 * The file bytes must reach Airtable without passing through the model. If the
 * bytes are a tool argument the model has to generate them character by
 * character, which is impossibly slow for a real document — and where the model
 * only receives a file as extracted text it cannot reproduce the original at
 * all, so it may "helpfully" author a lookalike instead. This widget reads the
 * actual file the user picks and sends those exact bytes.
 *
 * HOW THE BYTES GET OUT
 * ---------------------
 * Two paths, tried in order:
 *   1. DIRECT — multipart POST to this Worker's /upload with the sealed ticket.
 *      Supports the full 5 MB Airtable allows.
 *   2. RELAY — if the host's iframe CSP blocks that cross-origin POST, hand the
 *      bytes to the host as an MCP tool call (connector_upload_attachment) and
 *      let it forward them server-to-server. The MCP transport caps payloads at
 *      a few MB, so this path is limited to smaller files.
 * Either way the destination lives inside the ticket, so nothing the model says
 * can redirect the upload.
 *
 * VISIBILITY: completes the ui/initialize handshake and reports its height, or
 * the host may render it collapsed.
 */

export const UPLOADER_UI_URI = "ui://airtable-mcp/uploader.html";

export const UPLOADER_WIDGET_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Upload to Airtable</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  html, body { min-height: 230px; }
  body {
    margin: 0; padding: 12px; background: transparent; color: #16161d;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    max-width: 560px; margin: 0 auto; padding: 18px; border-radius: 14px;
    border: 1px solid rgba(120,120,150,.25); background: rgba(255,255,255,.6);
  }
  @media (prefers-color-scheme: dark) {
    body { color: #ececf1; }
    .card { background: rgba(28,28,40,.5); border-color: rgba(160,160,200,.2); }
  }
  h1 { font-size: 15px; margin: 0 0 4px; font-weight: 650; }
  .sub { font-size: 12.5px; opacity: .72; margin: 0 0 6px; }
  .dest {
    font-size: 12px; opacity: .8; margin: 0 0 14px; padding: 7px 10px; border-radius: 8px;
    background: rgba(120,120,160,.12); word-break: break-word;
  }
  .dest b { font-weight: 620; }
  .drop {
    border: 1.5px dashed rgba(120,120,160,.5); border-radius: 12px; padding: 26px 16px;
    text-align: center; cursor: pointer; transition: .15s; user-select: none;
  }
  .drop:hover, .drop.drag { border-color: #ffb100; background: rgba(255,177,0,.09); }
  .drop .big { font-size: 26px; line-height: 1; margin-bottom: 8px; }
  .drop .hint { font-size: 12px; opacity: .65; margin-top: 6px; }
  input[type=file] { display: none; }
  .row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .fname { font-weight: 600; word-break: break-all; flex: 1; }
  .fsize { opacity: .6; font-size: 12px; white-space: nowrap; }
  .bar { height: 8px; border-radius: 99px; background: rgba(120,120,160,.2); overflow: hidden; margin-top: 12px; }
  .bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#ffb100,#ffd166); transition: width .2s; }
  .status { margin-top: 12px; font-size: 13px; }
  .ok { color: #0a8f57; }
  .err { color: #d63031; }
  .muted { opacity: .7; }
  button.again {
    margin-top: 14px; padding: 8px 14px; border-radius: 9px; cursor: pointer; font: inherit;
    border: 1px solid rgba(120,120,160,.4); background: transparent; color: inherit;
  }
  button.again:hover { border-color: #ffb100; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="card">
  <h1>Upload a document to Airtable</h1>
  <p class="sub">The file you pick is sent exactly as it is on your computer — nothing is rewritten or regenerated.</p>
  <p class="dest" id="dest">Preparing the upload session&hellip;</p>

  <div id="drop" class="drop" role="button" tabindex="0" aria-label="Choose a file to upload">
    <div class="big">&#11014;&#65039;</div>
    <div><strong>Click to choose</strong> or drag a file here</div>
    <div class="hint">Any file type &middot; up to 5 MB (Airtable's API limit)</div>
  </div>
  <input id="file" type="file" />

  <div id="progress" class="hidden">
    <div class="row">
      <span class="fname" id="fname"></span>
      <span class="fsize" id="fsize"></span>
    </div>
    <div class="bar"><i id="barfill"></i></div>
    <div class="status muted" id="status">Preparing&hellip;</div>
  </div>

  <div id="done" class="hidden">
    <div class="status ok" id="doneMsg"></div>
    <button class="again" id="againBtn">Upload another file</button>
  </div>

  <div id="fatal" class="status err hidden"></div>
</div>

<script>
(function () {
  "use strict";

  // Airtable refuses more than 5 MB of file bytes through its API.
  var MAX_BYTES = 5 * 1024 * 1024;
  // The relay path travels as an MCP tool-call payload, which the transport caps
  // at a few MB. Base64 inflates by ~4/3, so keep raw bytes well under that.
  var RELAY_MAX_BYTES = 3 * 1024 * 1024;
  var inApp = !!(window.parent && window.parent !== window);

  // -- host messaging (MCP Apps over postMessage) ------------------------
  function postToHost(msg) {
    try { if (inApp) window.parent.postMessage(msg, "*"); } catch (e) {}
  }

  function reportSize() {
    try {
      var h = Math.max(
        document.documentElement ? document.documentElement.scrollHeight : 0,
        document.body ? document.body.scrollHeight : 0,
        document.body ? document.body.offsetHeight : 0,
        230
      );
      if (document.documentElement) document.documentElement.style.height = h + "px";
      var w = (document.documentElement && document.documentElement.scrollWidth) || 560;
      postToHost({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { width: w, height: h } });
      postToHost({ type: "ui-size-change", payload: { height: h, width: w } });
    } catch (e) {}
  }

  var _rpcId = 1;      // id 1 is reserved for ui/initialize
  var _pending = {};
  var _initialized = false;

  function sendInitialized() {
    if (_initialized) return;
    _initialized = true;
    postToHost({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
    reportSize();
  }
  function handshake() {
    postToHost({
      jsonrpc: "2.0", id: 1, method: "ui/initialize",
      params: {
        appInfo: { name: "airtable-uploader", version: "1.0.0" },
        clientInfo: { name: "airtable-uploader", version: "1.0.0" },
        appCapabilities: {}, capabilities: {},
        protocolVersion: "2026-01-26"
      }
    });
    setTimeout(sendInitialized, 250);
  }

  function callServerTool(name, args) {
    return new Promise(function (resolve, reject) {
      if (!inApp) { reject(new Error("No host to relay through.")); return; }
      var id = ++_rpcId;
      _pending[id] = { resolve: resolve, reject: reject };
      postToHost({ jsonrpc: "2.0", id: id, method: "tools/call", params: { name: name, arguments: args } });
      setTimeout(function () {
        if (_pending[id]) { delete _pending[id]; reject(new Error("Timed out waiting for Airtable.")); }
      }, 180000);
    });
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d) return;
    if (d.id != null && _pending[d.id]) {
      var p = _pending[d.id]; delete _pending[d.id];
      if (d.error) { try { p.reject(new Error((d.error && d.error.message) || "Tool call failed")); } catch (e) {} }
      else p.resolve(d.result || {});
      return;
    }
    if (d.result || d.id === 1 || (d.params && d.params.hostContext)) sendInitialized();
    try { scanForConfig(d, 0); } catch (e) {}
  });

  // -- upload session, delivered via the tool result ---------------------
  var cfg = { uploadUrl: null, ticket: null, label: null };

  function fromQuery() {
    try {
      var q = new URLSearchParams(location.search);
      var u = q.get("uploadUrl"), t = q.get("ticket");
      if (u && t) { cfg.uploadUrl = u; cfg.ticket = t; applyConfig(); return true; }
    } catch (e) {}
    return false;
  }

  // Hosts deliver the tool result in varying shapes, so walk whatever arrives
  // and pick out the payload by its keys.
  function scanForConfig(obj, depth) {
    if (!obj || depth > 6 || cfg.ticket) return;
    if (typeof obj === "string") {
      if (obj.indexOf("uploadUrl") !== -1 && obj.indexOf("ticket") !== -1) {
        try { scanForConfig(JSON.parse(obj), depth + 1); } catch (e) {}
      }
      return;
    }
    if (typeof obj !== "object") return;
    if (obj.uploadUrl && obj.ticket) {
      cfg.uploadUrl = obj.uploadUrl;
      cfg.ticket = obj.ticket;
      if (obj.destinationLabel) cfg.label = obj.destinationLabel;
      applyConfig();
      return;
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) scanForConfig(obj[keys[i]], depth + 1);
  }

  function applyConfig() {
    if (cfg.label) $("dest").innerHTML = "Destination: <b>" + escapeHtml(cfg.label) + "</b>";
    else $("dest").textContent = "Ready to upload.";
    reportSize();
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // -- DOM ---------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  var drop, fileInput, progressBox, doneBox, fatalBox;

  function human(n) {
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }
  function show(el) { el.classList.remove("hidden"); reportSize(); }
  function hide(el) { el.classList.add("hidden"); reportSize(); }
  function fatal(msg) { hide(progressBox); hide(doneBox); show(drop); fatalBox.textContent = msg; show(fatalBox); }

  function beginProgress(file, label) {
    hide(drop); hide(doneBox); hide(fatalBox); show(progressBox);
    $("fname").textContent = file.name;
    $("fsize").textContent = human(file.size);
    $("status").textContent = label;
    $("status").className = "status muted";
    $("barfill").style.width = "0%";
  }

  function finishDone(file) {
    $("barfill").style.width = "100%";
    hide(progressBox);
    $("doneMsg").innerHTML = "&#10003; Uploaded <b>" + escapeHtml(file.name) + "</b> (" + human(file.size) +
      ") to Airtable.<br><span class='muted'>The original file was sent unchanged.</span>";
    show(doneBox);
  }

  function pickFile(file) {
    hide(fatalBox); hide(doneBox);
    if (!file) return;
    if (file.size === 0) { fatal("That file is empty."); return; }
    if (file.size > MAX_BYTES) {
      fatal("This file is " + human(file.size) + ". Airtable's API accepts at most 5 MB — " +
            "bigger files have to be added from the Airtable UI.");
      return;
    }
    if (!cfg.ticket) {
      beginProgress(file, "Connecting…");
      setTimeout(function () {
        if (!cfg.ticket) fatal("No upload session. Ask Claude to open the uploader again.");
        else directUpload(file);
      }, 1500);
      return;
    }
    directUpload(file);
  }

  // PATH 1 - direct multipart POST to the Worker.
  function directUpload(file) {
    beginProgress(file, "Uploading…");
    var form = new FormData();
    form.append("file", file, file.name);
    form.append("filename", file.name);
    form.append("ticket", cfg.ticket);
    var sep = cfg.uploadUrl.indexOf("?") === -1 ? "?" : "&";
    var url = cfg.uploadUrl + sep + "ticket=" + encodeURIComponent(cfg.ticket);

    var xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        var pct = Math.round((e.loaded / e.total) * 100);
        $("barfill").style.width = pct + "%";
        $("status").textContent = pct < 100 ? ("Uploading… " + pct + "%") : "Finishing…";
      }
    };
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) { finishDone(file); return; }
      var msg = "Upload failed (" + xhr.status + ").";
      try { var r = JSON.parse(xhr.responseText); if (r && r.error) msg = r.error; } catch (e) {}
      fatal(msg);
    };
    // A blocked cross-origin POST surfaces here with no status. Fall back to the
    // relay rather than failing, since some hosts sandbox the iframe hard.
    xhr.onerror = function () { relayUpload(file); };
    try { xhr.send(form); } catch (e) { relayUpload(file); }
  }

  // PATH 2 - hand the bytes to the host, which forwards them server-to-server.
  function readBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error("Couldn't read the file.")); };
      fr.onload = function () {
        var s = String(fr.result);
        var i = s.indexOf(",");
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      fr.readAsDataURL(blob);
    });
  }

  function relayUpload(file) {
    if (!inApp) { fatal("Network error during upload."); return; }
    if (file.size > RELAY_MAX_BYTES) {
      fatal("This file is " + human(file.size) + " and this chat can't relay files that large. " +
            "Files up to 3 MB work here; up to 5 MB from the Airtable UI.");
      return;
    }
    beginProgress(file, "Uploading…");
    $("barfill").style.width = "35%";
    readBase64(file).then(function (b64) {
      $("barfill").style.width = "70%";
      $("status").textContent = "Sending to Airtable…";
      return callServerTool("connector_upload_attachment", {
        ticket: cfg.ticket,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        fileBase64: b64
      });
    }).then(function (result) {
      if (result && result.isError) {
        var t = "";
        try { t = (result.content || []).map(function (c) { return c.text; }).join(" "); } catch (e) {}
        fatal(t || "Upload failed. Please try again.");
        return;
      }
      finishDone(file);
    }).catch(function (err) { fatal((err && err.message) || "Upload failed."); });
  }

  // -- wire up ------------------------------------------------------------
  function init() {
    drop = $("drop"); fileInput = $("file");
    progressBox = $("progress"); doneBox = $("done"); fatalBox = $("fatal");

    drop.addEventListener("click", function () { fileInput.click(); });
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) pickFile(fileInput.files[0]);
    });
    ["dragenter", "dragover"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("drag"); });
    });
    drop.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) pickFile(e.dataTransfer.files[0]);
    });
    $("againBtn").addEventListener("click", function () {
      fileInput.value = "";
      hide(doneBox); hide(fatalBox); hide(progressBox); show(drop);
    });

    fromQuery();
    handshake();
    reportSize();
    [50, 200, 500, 1000].forEach(function (ms) { setTimeout(reportSize, ms); });
    if (window.MutationObserver) {
      try { new MutationObserver(reportSize).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
    }
    window.addEventListener("resize", reportSize);
    window.addEventListener("load", reportSize);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
</script>
</body>
</html>`;
