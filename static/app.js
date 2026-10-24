"use strict";

/* ==================================================================== */
/* Helpers                                                               */
/* ==================================================================== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICONS = {
  home: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  board: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M8 7v8M12 7v4M16 7v10"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  play: '<path d="m7 4 13 8-13 8z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  wand: '<path d="m15 4 5 5L9 20H4v-5z"/><path d="m13 6 5 5"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
const spinner = '<span class="spinner" aria-hidden="true"></span>';

function hydrateIcons(root = document) {
  $$("[data-icon]", root).forEach((el) => {
    el.outerHTML = icon(el.dataset.icon);
  });
}

async function api(path, { method = "GET", body, quiet = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const msg = "Can't reach Autoblog. Is the app still running?";
    if (!quiet) toast(msg, "error");
    throw new Error(msg);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const detail = data && data.detail;
    const msg = typeof detail === "string" ? detail : res.status === 422 ? "Please check what you typed." : `Something went wrong (${res.status}).`;
    if (!quiet) toast(msg, "error");
    throw new Error(msg);
  }
  return data;
}

function toast(message, kind = "info", ms = 4200) {
  const iconName = { success: "check", error: "alert", info: "sparkles" }[kind] || "sparkles";
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  el.innerHTML = `${icon(iconName)}<div>${esc(message)}</div>`;
  $("#toasts").append(el);
  setTimeout(() => { el.classList.add("leaving"); setTimeout(() => el.remove(), 220); }, kind === "error" ? ms + 2500 : ms);
}

function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  wrapped.flush = (...args) => { clearTimeout(t); return fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

async function withBusy(button, label, fn) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `${spinner}<span>${esc(label)}</span>`;
  try { return await fn(); } finally { button.disabled = false; button.innerHTML = original; }
}

const toDate = (s) => (s ? new Date(s) : null);
function ago(s) {
  const d = toDate(s);
  if (!d || isNaN(d)) return "";
  const diff = (d - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, sec] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]) {
    if (abs >= sec) return rtf.format(Math.round(diff / sec), unit);
  }
  return rtf.format(Math.round(diff / 60), "minute");
}
const fmtDate = (s) =>
  toDate(s)?.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) || "";
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/* ==================================================================== */
/* Status vocabulary                                                     */
/* ==================================================================== */
const STATUS = {
  idea: { label: "Idea", tone: "amber" },
  queued: { label: "Waiting to start", tone: "violet" },
  generating: { label: "Writing…", tone: "violet" },
  failed: { label: "Needs attention", tone: "red" },
  review: { label: "Ready to review", tone: "blue" },
  scheduled: { label: "Scheduled", tone: "teal" },
  published: { label: "Published", tone: "green" },
};
const COLUMNS = [
  { key: "idea", title: "Ideas", tone: "amber", icon: "bulb", statuses: ["idea"], empty: "Topics you want to write about. Click <b>New post</b> to add some." },
  { key: "writing", title: "Writing", tone: "violet", icon: "wand", statuses: ["queued", "generating", "failed"], empty: "Nothing is being written right now." },
  { key: "review", title: "Ready to review", tone: "blue", icon: "eye", statuses: ["review"], empty: "Finished drafts land here for you to check." },
  { key: "scheduled", title: "Scheduled", tone: "teal", icon: "calendar", statuses: ["scheduled"], empty: "Posts waiting for their publish date." },
  { key: "published", title: "Published", tone: "green", icon: "globe", statuses: ["published"], empty: "Your live posts will show up here." },
];
const STEPS = [
  { key: "outline", label: "Outline", help: "Groq plans the headings and keywords" },
  { key: "article", label: "Article", help: "Gemini writes the full post" },
  { key: "image", label: "Image", help: "Pollinations creates the featured image" },
];
const SERVICES = [
  { key: "groq", name: "Groq", role: "Plans the outline", field: "GROQ_API_KEY", link: "https://console.groq.com/keys" },
  { key: "gemini", name: "Google Gemini", role: "Writes the article", field: "GEMINI_API_KEY", link: "https://aistudio.google.com/apikey" },
  { key: "pollinations", name: "Pollinations", role: "Creates the featured image", field: "POLLINATIONS_API_KEY", link: "https://enter.pollinations.ai" },
  { key: "wordpress", name: "WordPress", role: "Publishes your posts" },
];

const pill = (status) => {
  const s = STATUS[status] || { label: status, tone: "" };
  return `<span class="pill tone-${s.tone}">${esc(s.label)}</span>`;
};
const postName = (p) => p.title || p.topic;

function stepper(stage, status) {
  const current = status === "queued" ? -1 : STEPS.findIndex((s) => s.key === stage);
  return `<div class="steps">${STEPS.map((s, i) => {
    const cls = i < current ? "done" : i === current ? "active" : "";
    const line = i < STEPS.length - 1 ? `<span class="step-line ${i < current ? "done" : ""}"></span>` : "";
    return `<span class="step ${cls}"><span class="step-dot">${i < current ? icon("check") : ""}</span>${s.label}</span>${line}`;
  }).join("")}</div>`;
}

/* ==================================================================== */
/* Router                                                                */
/* ==================================================================== */
let leaveHandlers = [];
const onLeave = (fn) => leaveHandlers.push(fn);

function poll(fn, ms) {
  let stopped = false;
  let timer;
  const tick = async () => {
    if (stopped) return;
    try { await fn(); } catch { /* keep polling */ }
    if (!stopped) timer = setTimeout(tick, ms);
  };
  timer = setTimeout(tick, ms);
  onLeave(() => { stopped = true; clearTimeout(timer); });
}

async function route() {
  leaveHandlers.forEach((fn) => fn());
  leaveHandlers = [];
  const path = location.hash.slice(1).split("#")[0] || "/";
  const [, page = "", id] = path.split("/");
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === (page || "home") || (page === "post" && a.dataset.route === "board")));
  const view = $("#view");
  view.innerHTML = `<div class="loading">${spinner}</div>`;
  window.scrollTo(0, 0);
  try {
    if (!page) await renderHome(view);
    else if (page === "board") await renderBoard(view);
    else if (page === "post" && id) await renderPost(view, Number(id));
    else if (page === "settings") await renderSettings(view);
    else location.hash = "#/";
  } catch (err) {
    view.innerHTML = `<div class="page"><div class="card empty">${icon("alert")}<p>${esc(err.message)}</p>
      <p style="margin-top:12px"><a class="btn" href="#/">Back to dashboard</a></p></div></div>`;
  }
}

/* ==================================================================== */
/* Dashboard                                                             */
/* ==================================================================== */
async function renderHome(view) {
  const data = await api("/api/summary");
  view.innerHTML = `
    <div class="page">
      <header class="page-head">
        <div><h1>${greeting()}</h1><p class="muted">Here's what's happening with your blog.</p></div>
      </header>
      <div id="setup"></div>
      <section class="card hero-add">
        <h2>What should we write about next?</h2>
        <p class="muted small">Type a topic or keyword. Autoblog plans it, writes it and makes an image; you review it before it goes live.</p>
        <form id="quick-add">
          <input class="input" name="topic" placeholder="e.g. How to start a vegetable garden on a balcony" autocomplete="off" required maxlength="300">
          <button class="btn btn-primary btn-lg" type="submit">${icon("sparkles")}<span>Write it</span></button>
        </form>
        <p class="hint">Have lots of ideas? Use <a href="#" data-action="new-post">New post</a> to add many at once, or get topic suggestions. Shortcut: <span class="kbd">N</span></p>
      </section>
      <div class="stats" id="stats"></div>
      <div class="home-grid">
        <div class="stack">
          <section class="card"><div class="card-head"><h2>${icon("inbox")} Needs your attention</h2><a class="small" href="#/board">All posts →</a></div><div id="attention"></div></section>
          <section class="card"><div class="card-head"><h2>${icon("wand")} Being written</h2></div><div id="progress"></div></section>
          <section class="card"><div class="card-head"><h2>${icon("clock")} Recent activity</h2></div><div id="activity"></div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><h2>${icon("globe")} Connections</h2>
            <button class="btn btn-sm" id="test-all">${icon("refresh", "icon-sm")}<span>Test</span></button></div>
            <div id="services"></div></section>
          <section class="card"><div class="card-head"><h2>${icon("calendar")} Coming up</h2></div><div id="upcoming"></div></section>
        </div>
      </div>
    </div>`;

  const fill = (d) => {
    $("#setup").innerHTML = setupCard(d);
    $("#stats").innerHTML = statTiles(d.counts);
    $("#attention").innerHTML = attentionList(d.attention);
    $("#progress").innerHTML = progressList(d.in_progress);
    $("#activity").innerHTML = activityList(d.activity);
    $("#services").innerHTML = servicesList(d.services, d.setup);
    $("#upcoming").innerHTML = upcomingList(d.upcoming);
  };
  fill(data);

  $("#quick-add").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = e.target.topic;
    const topic = input.value.trim();
    if (!topic) return;
    await withBusy(e.target.querySelector("button"), "Starting…", async () => {
      const { ids } = await api("/api/posts", { method: "POST", body: { topics: [topic], generate: true } });
      toast("Writing has started. This usually takes 1–3 minutes.", "success");
      location.hash = `#/post/${ids[0]}`;
    });
  });

  $("#test-all").addEventListener("click", (e) => testConnections(e.currentTarget, data.setup));

  let lastKey = "";
  poll(async () => {
    const d = await api("/api/summary", { quiet: true });
    const key = JSON.stringify([d.counts, d.in_progress.map((p) => [p.id, p.stage, p.status]), d.activity[0]?.id, d.services]);
    if (key !== lastKey) { lastKey = key; fill(d); Object.assign(data, d); }
  }, 2500);
}

function setupCard(d) {
  const steps = [
    { done: d.setup.ai_ready, title: "Connect the AI services", text: "Paste your free Groq, Gemini and Pollinations keys.", href: "#/settings", cta: "Add keys" },
    { done: d.setup.wordpress_ready, title: "Connect your WordPress site", text: "So finished posts can be published with one click.", href: "#/settings#wordpress", cta: "Connect site" },
    { done: d.total > 0, title: "Write your first post", text: "Type a topic below and Autoblog does the rest.", action: "new-post", cta: "Start writing" },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return "";
  return `<section class="card setup">
    <div class="card-head" style="margin-bottom:0"><div><h2 style="font-size:18px">Let's get your blog running</h2>
      <p class="muted small">${done} of ${steps.length} steps done · takes about 5 minutes</p></div></div>
    <div class="progress-track"><span style="width:${(done / steps.length) * 100}%"></span></div>
    <div class="setup-steps">${steps.map((s, i) => `
      <div class="setup-step ${s.done ? "done" : ""}">
        <span class="setup-num">${s.done ? icon("check", "icon-sm") : i + 1}</span>
        <div><strong>${s.title}</strong><p>${s.text}</p>
          ${s.done ? "" : s.href ? `<a class="btn btn-sm" href="${s.href}">${s.cta}</a>` : `<button class="btn btn-sm" data-action="${s.action}">${s.cta}</button>`}
        </div>
      </div>`).join("")}
    </div></section>`;
}

function statTiles(c) {
  const tiles = [
    { label: "Ideas", n: c.idea, tone: "amber", icon: "bulb" },
    { label: "Writing", n: c.queued + c.generating + c.failed, tone: "violet", icon: "wand" },
    { label: "To review", n: c.review, tone: "blue", icon: "eye" },
    { label: "Scheduled", n: c.scheduled, tone: "teal", icon: "calendar" },
    { label: "Published", n: c.published, tone: "green", icon: "globe" },
  ];
  return tiles.map((t) => `<a class="stat tone-${t.tone}" href="#/board">
    <span class="stat-label">${icon(t.icon)}${t.label}</span><div class="stat-value">${t.n}</div></a>`).join("");
}

const thumb = (p) => p.image_file
  ? `<img class="thumb" src="/images/${encodeURIComponent(p.image_file)}" alt="" loading="lazy">`
  : `<span class="thumb">${icon(p.status === "failed" ? "alert" : "pen")}</span>`;

function attentionList(items) {
  if (!items.length) return `<div class="empty">${icon("check")}<p>All caught up. Nothing needs you right now.</p></div>`;
  return `<div class="list">${items.map((p) => `
    <div class="list-item">
      ${thumb(p)}
      <div class="grow">
        <a class="list-title" href="#/post/${p.id}">${esc(postName(p))}</a>
        <div class="list-sub">${p.status === "failed" ? `<span style="color:var(--red)">${esc(p.error || "Something went wrong")}</span>` : `${plural(p.words, "word")} · finished ${ago(p.updated_at)}`}</div>
      </div>
      ${p.status === "failed"
        ? `<button class="btn btn-sm" data-action="retry" data-id="${p.id}">${icon("refresh", "icon-sm")}Try again</button>`
        : `<a class="btn btn-sm btn-primary" href="#/post/${p.id}">Review</a>`}
    </div>`).join("")}</div>`;
}

function progressList(items) {
  if (!items.length) return `<div class="empty">${icon("wand")}<p>Nothing is being written. Add a topic above to start.</p></div>`;
  return `<div class="list">${items.map((p) => `
    <div class="list-item"><div class="grow">
      <a class="list-title" href="#/post/${p.id}">${esc(postName(p))}</a>
      ${p.status === "queued" ? `<div class="list-sub">Waiting in line…</div>` : stepper(p.stage, p.status)}
    </div></div>`).join("")}</div>`;
}

const ACTIVITY_LOOK = {
  ready: ["blue", "eye"], published: ["green", "globe"], scheduled: ["teal", "calendar"], draft: ["blue", "send"],
  failed: ["red", "alert"], queued: ["violet", "wand"], idea: ["amber", "bulb"], deleted: ["", "trash"],
};
function activityList(items) {
  if (!items.length) return `<div class="empty">${icon("clock")}<p>Your activity will show up here.</p></div>`;
  return items.map((a) => {
    const [tone, ic] = ACTIVITY_LOOK[a.kind] || ["", "sparkles"];
    const text = a.post_id && a.kind !== "deleted" ? `<a href="#/post/${a.post_id}" style="color:inherit">${esc(a.message)}</a>` : esc(a.message);
    return `<div class="activity-item"><span class="activity-icon ${tone ? `tone-${tone}` : ""}">${icon(ic)}</span>
      <div><div>${text}</div><div class="activity-time">${ago(a.created_at)}</div></div></div>`;
  }).join("");
}

function servicesList(status, setup) {
  return SERVICES.map((s) => {
    const r = status[s.key];
    const configured = s.key === "wordpress" ? setup.wordpress_ready : !setup.missing.includes(s.field);
    const level = r ? r.level : configured ? "" : "off";
    const msg = r ? r.message : configured ? "Saved; click Test to check" : "Not set up yet";
    return `<div class="service"><span class="dot ${level}"></span>
      <div class="grow" style="flex:1;min-width:0"><div class="service-name">${s.name}</div><div class="service-msg">${esc(msg)}</div></div>
      ${configured ? "" : `<a class="btn btn-sm" href="#/settings">Set up</a>`}</div>`;
  }).join("");
}

function upcomingList(items) {
  if (!items.length) return `<div class="empty">${icon("calendar")}<p>No posts scheduled. Schedule one from the review screen.</p></div>`;
  return `<div class="list">${items.map((p) => `
    <div class="list-item">${thumb(p)}<div class="grow">
      <a class="list-title" href="#/post/${p.id}">${esc(postName(p))}</a>
      <div class="list-sub">${fmtDate(p.scheduled_at)} · ${ago(p.scheduled_at)}</div></div></div>`).join("")}</div>`;
}

async function testConnections(button, setup) {
  $$("#services .dot").forEach((d) => (d.className = "dot checking"));
  await withBusy(button, "Testing…", async () => {
    const results = await api("/api/test", { method: "POST" });
    const box = $("#services");
    if (box) box.innerHTML = servicesList(results, setup);
    const bad = Object.values(results).filter((r) => r.level === "error").length;
    toast(bad ? `${plural(bad, "connection")} need attention.` : "Connections checked.", bad ? "error" : "success");
  });
}

/* ==================================================================== */
/* Board                                                                 */
/* ==================================================================== */
async function renderBoard(view) {
  let posts = await api("/api/posts");
  let filter = "";
  view.innerHTML = `
    <div class="page" style="max-width:none">
      <header class="page-head">
        <div><h1>Posts</h1><p class="muted">Every post, from first idea to live on your site. Click a card to open it.</p></div>
        <div class="page-actions board-tools">
          <label class="search"><span class="sr-only">Search posts</span>${icon("search")}<input class="input" id="board-search" placeholder="Search posts" autocomplete="off"></label>
          <button class="btn" id="write-all">${icon("play", "icon-sm")}<span>Write all ideas</span></button>
        </div>
      </header>
      <div class="board" id="board"></div>
    </div>`;

  const draw = () => {
    const q = filter.toLowerCase();
    const visible = posts.filter((p) => !q || postName(p).toLowerCase().includes(q) || p.topic.toLowerCase().includes(q));
    $("#board").innerHTML = COLUMNS.map((col) => {
      const items = visible.filter((p) => col.statuses.includes(p.status));
      return `<section class="column tone-${col.tone}" aria-label="${col.title}">
        <div class="column-head"><span class="dot"></span><h2>${col.title}</h2><span class="column-count">${items.length}</span></div>
        <div class="column-body">${items.length ? items.map(postCard).join("") : `<div class="empty">${q ? "No matches" : col.empty}</div>`}</div>
      </section>`;
    }).join("");
    const ideas = posts.filter((p) => p.status === "idea").length;
    const writeAll = $("#write-all");
    writeAll.classList.toggle("hidden", ideas < 2);
    writeAll.querySelector("span").textContent = `Write all ${ideas} ideas`;
  };
  draw();

  $("#board-search").addEventListener("input", (e) => { filter = e.target.value; draw(); });
  $("#write-all").addEventListener("click", async (e) => {
    await withBusy(e.currentTarget, "Starting…", async () => {
      const { queued } = await api("/api/generate-all-ideas", { method: "POST" });
      toast(`Writing ${plural(queued, "post")}, one after another.`, "success");
      posts = await api("/api/posts");
      draw();
    });
  });

  let lastKey = JSON.stringify(posts);
  poll(async () => {
    const fresh = await api("/api/posts", { quiet: true });
    const key = JSON.stringify(fresh);
    if (key !== lastKey) { lastKey = key; posts = fresh; draw(); }
  }, 2500);
}

function postCard(p) {
  const img = p.image_file ? `<img src="/images/${encodeURIComponent(p.image_file)}" alt="" loading="lazy">` : "";
  let extra = "";
  if (p.status === "generating" || p.status === "queued") {
    extra = p.status === "queued" ? `<div class="post-card-meta">${spinner} Waiting in line…</div>` : stepper(p.stage, p.status);
  } else if (p.status === "failed") {
    extra = `<div class="error-text">${esc(p.error || "Something went wrong")}</div>
      <div class="post-card-actions"><button class="btn btn-sm" data-action="retry" data-id="${p.id}">${icon("refresh", "icon-sm")}Try again</button></div>`;
  } else if (p.status === "idea") {
    extra = `<div class="post-card-actions"><button class="btn btn-sm btn-primary" data-action="write" data-id="${p.id}">${icon("sparkles", "icon-sm")}Write it</button></div>`;
  }
  const meta = [];
  if (p.status === "scheduled") meta.push(`${icon("calendar", "icon-sm")} ${esc(fmtDate(p.scheduled_at))}`);
  else if (p.status === "published") meta.push(`${icon("globe", "icon-sm")} ${esc(ago(p.published_at || p.updated_at))}`);
  else if (p.words && p.status === "review") meta.push(plural(p.words, "word"));
  if (p.status === "review" && p.wp_status === "draft") meta.push(`<span class="pill">In WordPress drafts</span>`);
  if (!["scheduled", "published", "queued", "generating"].includes(p.status)) meta.push(esc(ago(p.updated_at)));
  return `<a class="post-card ${p.status === "failed" ? "failed" : ""}" href="#/post/${p.id}">${img}
    <div class="post-card-body"><h3>${esc(postName(p))}</h3>
      ${meta.length ? `<div class="post-card-meta">${meta.join(" · ")}</div>` : ""}${extra}</div></a>`;
}

/* ==================================================================== */
/* Post screen (idea / writing / failed / editor)                       */
/* ==================================================================== */
async function renderPost(view, id) {
  const post = await api(`/api/posts/${id}`);
  if (post.status === "idea") return renderIdea(view, post);
  if (post.status === "queued" || post.status === "generating") return renderWriting(view, post);
  if (post.status === "failed") return renderFailed(view, post);
  return renderEditor(view, post);
}

const backLink = `<a class="back" href="#/board">${icon("back", "icon-sm")} All posts</a>`;

function renderIdea(view, post) {
  view.innerHTML = `<div class="page" style="max-width:720px">
    <div class="editor-top">${backLink}${pill("idea")}</div>
    <section class="card" style="padding:28px">
      <div class="writing-orb" style="animation:none;width:60px;height:60px;border-radius:18px;margin:0 0 16px">${icon("bulb")}</div>
      <h1 style="font-size:22px">This is still an idea</h1>
      <p class="muted" style="margin:6px 0 20px">When you're ready, Autoblog will plan, write and illustrate it. You can change the topic first.</p>
      <div class="field"><label class="label" for="topic">Topic or keyword</label>
        <input class="input" id="topic" value="${esc(post.topic)}" maxlength="300"></div>
      <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
        <button class="btn btn-primary btn-lg" id="write">${icon("sparkles")}<span>Write this post</span></button>
        <button class="btn btn-ghost btn-danger" id="delete">${icon("trash")}<span>Delete idea</span></button>
      </div>
    </section></div>`;
  const saveTopic = debounce(() => api(`/api/posts/${post.id}`, { method: "PATCH", body: { topic: $("#topic").value.trim() || post.topic } }), 500);
  $("#topic").addEventListener("input", saveTopic);
  onLeave(() => saveTopic.cancel());
  $("#write").addEventListener("click", (e) => withBusy(e.currentTarget, "Starting…", async () => {
    await saveTopic.flush();
    await api(`/api/posts/${post.id}/generate`, { method: "POST" });
    route();
  }));
  $("#delete").addEventListener("click", () => deletePost(post));
}

function renderWriting(view, post) {
  view.innerHTML = `<div class="page">
    <div class="editor-top">${backLink}<span id="pill">${pill(post.status)}</span></div>
    <div class="writing">
      <div class="writing-orb">${icon("sparkles")}</div>
      <h1>Writing “${esc(post.topic)}”</h1>
      <p class="muted" style="margin-top:6px">This usually takes 1–3 minutes. You can leave this page; Autoblog keeps working and the post will be waiting in <b>Ready to review</b>.</p>
      <div class="steps-big" id="steps"></div>
      <details><summary class="muted small" style="justify-content:center">${icon("chevron", "icon-sm")} Show details</summary>
        <div class="log" id="log" style="margin-top:12px"></div></details>
    </div></div>`;

  const draw = (p) => {
    const current = p.status === "queued" ? -1 : STEPS.findIndex((s) => s.key === p.stage);
    $("#pill").innerHTML = pill(p.status);
    $("#steps").innerHTML = STEPS.map((s, i) => {
      const cls = i < current ? "done" : i === current ? "active" : "";
      return `<div class="step-card ${cls}"><span class="step ${cls}"><span class="step-dot">${i < current ? icon("check") : ""}</span>${s.label}</span>
        <p>${i < current ? "Done" : i === current ? `${s.help}…` : p.status === "queued" && i === 0 ? "Waiting for the post ahead to finish" : s.help}</p></div>`;
    }).join("");
    $("#log").innerHTML = logLines(p.log);
  };
  draw(post);

  poll(async () => {
    const p = await api(`/api/posts/${post.id}`, { quiet: true });
    if (p.status === "queued" || p.status === "generating") return draw(p);
    if (p.status === "review") toast("Your post is ready to review!", "success");
    route();
  }, 2000);
}

function logLines(log) {
  if (!log || !log.length) return `<div class="muted">No details yet.</div>`;
  return log.map((l) => `<div class="log-line ${esc(l.level)}"><time>${esc(new Date(l.time).toLocaleTimeString())}</time><span>${esc(l.message)}</span></div>`).join("");
}

function renderFailed(view, post) {
  const settingsHint = /Settings|key|model/i.test(post.error || "");
  view.innerHTML = `<div class="page" style="max-width:760px">
    <div class="editor-top">${backLink}${pill("failed")}</div>
    <section class="card" style="padding:28px">
      <h1 style="font-size:22px">We couldn't finish “${esc(post.topic)}”</h1>
      <div class="notice error" style="margin:16px 0">${icon("alert")}<div>${esc(post.error || "Something went wrong.")}</div></div>
      <p class="muted">${settingsHint ? "This usually means a key or model needs updating in Settings." : "This is often temporary: AI services get busy. Trying again usually works."}</p>
      <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap">
        <button class="btn btn-primary" id="retry">${icon("refresh")}<span>Try again</span></button>
        ${settingsHint ? `<a class="btn" href="#/settings">${icon("settings")}<span>Open Settings</span></a>` : ""}
        ${post.article ? `<button class="btn" id="keep">${icon("back")}<span>Back to the previous draft</span></button>` : ""}
        <button class="btn btn-ghost btn-danger" id="delete">${icon("trash")}<span>Delete</span></button>
      </div>
      <details style="margin-top:22px"><summary class="muted small">${icon("chevron", "icon-sm")} Technical details</summary>
        <div class="log" style="margin-top:12px">${logLines(post.log)}</div></details>
    </section></div>`;
  $("#retry").addEventListener("click", (e) => withBusy(e.currentTarget, "Starting…", async () => {
    await api(`/api/posts/${post.id}/generate`, { method: "POST" });
    route();
  }));
  $("#keep")?.addEventListener("click", async () => {
    await api(`/api/posts/${post.id}`, { method: "PATCH", body: { status: "review" } });
    route();
  });
  $("#delete").addEventListener("click", () => deletePost(post));
}

async function deletePost(post) {
  const ok = await confirmDialog({
    title: "Delete this post?",
    message: `“${postName(post)}” will be removed from Autoblog.${post.wp_post_id ? " It stays on your WordPress site; delete it there if you want it gone." : ""}`,
    confirm: "Delete",
    danger: true,
  });
  if (!ok) return;
  await api(`/api/posts/${post.id}`, { method: "DELETE" });
  toast("Post deleted.", "success");
  location.hash = "#/board";
}

/* ---------------------------- Editor ---------------------------- */
async function renderEditor(view, post) {
  const settings = await api("/api/settings", { quiet: true }).catch(() => null);
  const wpReady = settings ? settings.setup.wordpress_ready : true;
  let state = { ...post };
  let tab = "preview";

  view.innerHTML = `<div class="page">
    <div class="editor-top">${backLink}
      <div style="display:flex;align-items:center;gap:12px"><span class="save-state" id="save-state">${icon("check")} All changes saved</span>${pill(post.status)}</div>
    </div>
    <div class="editor">
      <div style="min-width:0">
        <textarea class="title-input" id="title" rows="1" aria-label="Post title" placeholder="Post title">${esc(post.title || post.topic)}</textarea>
        <div class="meta-grid">
          <div class="field"><label class="label" for="meta">Search snippet (meta description) <span class="counter" id="meta-count"></span></label>
            <textarea class="textarea" id="meta" rows="2" style="min-height:64px" placeholder="One or two sentences shown under your title in Google">${esc(post.meta_description || "")}</textarea></div>
          <div class="field"><label class="label" for="keyword">Focus keyword</label>
            <input class="input" id="keyword" value="${esc(post.keyword || "")}" placeholder="e.g. balcony vegetable garden">
            <span class="help">The search phrase this post should rank for.</span></div>
        </div>
        <div class="tabs" role="tablist">
          <button class="tab" data-tab="preview" role="tab">${icon("eye", "icon-sm")}Preview</button>
          <button class="tab" data-tab="edit" role="tab">${icon("pen", "icon-sm")}Edit text</button>
          <button class="tab" data-tab="outline" role="tab">${icon("list", "icon-sm")}Outline</button>
          <button class="tab" data-tab="log" role="tab">${icon("terminal", "icon-sm")}History</button>
        </div>
        <div id="tab-preview"><article class="preview-paper"><div class="prose" id="preview"></div></article></div>
        <div id="tab-edit" class="hidden">
          <p class="help" style="margin-bottom:10px">This is Markdown: <code>## Heading</code>, <code>**bold**</code>, <code>- list item</code>. Changes save automatically.</p>
          <textarea class="article-input" id="article" spellcheck="true" aria-label="Article text">${esc(post.article || "")}</textarea>
        </div>
        <div id="tab-outline" class="hidden"><article class="preview-paper"><div class="prose" id="outline"></div></article></div>
        <div id="tab-log" class="hidden"><div class="log">${logLines(post.log)}</div></div>
      </div>
      <aside class="editor-side">
        <section class="card" id="publish-card"></section>
        <section class="card"><div class="card-head"><h2>${icon("chart")} SEO check</h2></div><div id="seo"></div></section>
        <section class="card"><div class="card-head"><h2>${icon("image")} Featured image</h2></div><div id="image-card"></div></section>
        <section class="card"><div class="card-head"><h2>${icon("wand")} More</h2></div>
          <div class="stack" style="gap:8px">
            <button class="btn btn-block" id="rewrite">${icon("refresh")}<span>Rewrite with AI</span></button>
            <button class="btn btn-block btn-ghost btn-danger" id="delete">${icon("trash")}<span>Delete post</span></button>
          </div></section>
      </aside>
    </div></div>`;

  const el = { title: $("#title"), meta: $("#meta"), keyword: $("#keyword"), article: $("#article") };
  const autoGrow = () => {
    for (const box of [el.title, el.meta]) { box.style.height = "auto"; box.style.height = `${box.scrollHeight + (box === el.meta ? 2 : 0)}px`; }
  };
  autoGrow();

  // ---- Autosave
  const saveState = $("#save-state");
  let dirty = false;
  const save = debounce(async () => {
    if (!dirty) return;
    dirty = false;
    saveState.innerHTML = `${spinner} Saving…`;
    try {
      await api(`/api/posts/${post.id}`, { method: "PATCH", quiet: true, body: {
        title: el.title.value.trim(), meta_description: el.meta.value.trim(), keyword: el.keyword.value.trim(), article: el.article.value,
      } });
      saveState.innerHTML = `${icon("check")} All changes saved`;
    } catch {
      dirty = true;
      saveState.innerHTML = `<span style="color:var(--red)">Couldn't save. Retrying…</span>`;
      save();
    }
  }, 700);
  const warnUnsaved = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", warnUnsaved);
  onLeave(() => { window.removeEventListener("beforeunload", warnUnsaved); save.flush(); });

  // ---- Preview + SEO
  const metaCount = () => {
    const n = el.meta.value.trim().length;
    const c = $("#meta-count");
    c.textContent = `${n}/160`;
    c.className = `counter ${n >= 120 && n <= 160 ? "good" : n ? "bad" : ""}`;
  };
  const refresh = debounce(async () => {
    const res = await api("/api/preview", { method: "POST", quiet: true, body: {
      title: el.title.value.trim(), meta_description: el.meta.value.trim(), keyword: el.keyword.value.trim(),
      article: el.article.value, has_image: Boolean(state.image_src),
    } }).catch(() => null);
    if (!res) return;
    const img = state.image_src ? `<img class="preview-image" src="${esc(state.image_src)}" alt="">` : "";
    $("#preview").innerHTML = `<h1>${esc(el.title.value.trim())}</h1>${img}${res.html}`;
    $("#seo").innerHTML = seoCard(res.seo);
  }, 350);

  const onEdit = () => { dirty = true; saveState.innerHTML = `<span class="muted">Unsaved changes</span>`; save(); refresh(); };
  el.title.addEventListener("input", () => { autoGrow(); onEdit(); });
  el.title.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
  el.meta.addEventListener("input", () => { autoGrow(); metaCount(); onEdit(); });
  el.keyword.addEventListener("input", onEdit);
  el.article.addEventListener("input", onEdit);
  metaCount();
  refresh.flush();

  if (post.outline) {
    api("/api/preview", { method: "POST", quiet: true, body: { article: post.outline } })
      .then((r) => { $("#outline").innerHTML = `<h1>Outline</h1>${r.html}`; }).catch(() => {});
  } else {
    $("#outline").innerHTML = `<p class="muted">No outline saved for this post.</p>`;
  }

  // ---- Tabs
  const showTab = (name) => {
    tab = name;
    $$(".tab").forEach((t) => { t.classList.toggle("active", t.dataset.tab === name); t.setAttribute("aria-selected", t.dataset.tab === name); });
    ["preview", "edit", "outline", "log"].forEach((n) => $(`#tab-${n}`).classList.toggle("hidden", n !== name));
    if (name === "edit") el.article.focus({ preventScroll: true });
  };
  $$(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  showTab(tab);

  // ---- Side cards
  const drawPublish = () => { $("#publish-card").innerHTML = publishCard(state, wpReady); bindPublish(); };
  const drawImage = () => { $("#image-card").innerHTML = imageCard(state); bindImage(); };

  function bindPublish() {
    const card = $("#publish-card");
    const when = $("#when", card);
    $$('input[name="mode"]', card).forEach((r) => r.addEventListener("change", () => {
      const mode = $('input[name="mode"]:checked', card).value;
      when?.classList.toggle("hidden", mode !== "schedule");
      const btn = $("#publish-btn", card);
      if (btn) btn.querySelector("span").textContent = { publish: "Publish now", schedule: "Schedule post", draft: "Save to WordPress drafts" }[mode];
    }));
    $("#publish-btn", card)?.addEventListener("click", async (e) => {
      const mode = $('input[name="mode"]:checked', card)?.value || "publish";
      const body = { mode };
      if (mode === "schedule") {
        const value = $("#when-input", card).value;
        if (!value) return toast("Pick a date and time first.", "error");
        const date = new Date(value);
        if (date <= new Date()) return toast("Pick a time in the future.", "error");
        body.date_gmt = date.toISOString().slice(0, 19);
      }
      if (mode === "publish") {
        const ok = await confirmDialog({
          title: state.status === "published" ? "Update the live post?" : "Publish to your site now?",
          message: state.status === "published" ? "Your latest edits will replace the version on your site." : "It will be visible to everyone straight away.",
          confirm: state.status === "published" ? "Update post" : "Publish",
        });
        if (!ok) return;
      }
      await save.flush();
      await withBusy(e.currentTarget, mode === "draft" ? "Saving…" : "Publishing…", async () => {
        const updated = await api(`/api/posts/${post.id}/publish`, { method: "POST", body });
        state = { ...state, ...updated };
        toast({ publish: "Published! Your post is live.", schedule: `Scheduled for ${fmtDate(updated.scheduled_at)}.`, draft: "Saved to your WordPress drafts." }[mode], "success");
        drawPublish();
      });
    });
  }

  function bindImage() {
    const card = $("#image-card");
    $("#new-image", card)?.addEventListener("click", async (e) => {
      const prompt = $("#image-prompt", card).value.trim();
      const box = $(".image-box", card);
      box.insertAdjacentHTML("beforeend", `<div class="busy">${spinner} Creating image…</div>`);
      await withBusy(e.currentTarget, "Creating…", async () => {
        try {
          const updated = await api(`/api/posts/${post.id}/image`, { method: "POST", body: { prompt } });
          state = { ...state, ...updated };
          toast("New image ready.", "success");
        } finally {
          drawImage();
          refresh();
        }
      });
    });
  }

  drawPublish();
  drawImage();

  $("#rewrite").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Rewrite this post?",
      message: "Autoblog will write a fresh outline, article and image. Your current text and edits will be replaced.",
      confirm: "Rewrite",
    });
    if (!ok) return;
    save.cancel();
    dirty = false;
    await api(`/api/posts/${post.id}/generate`, { method: "POST" });
    route();
  });
  $("#delete").addEventListener("click", () => deletePost(state));
}

function seoCard(seo) {
  const color = seo.score >= 80 ? "var(--green)" : seo.score >= 50 ? "var(--amber)" : "var(--red)";
  const verdict = seo.score >= 80 ? "Looking great" : seo.score >= 50 ? "Good, with a few tweaks to make" : "Needs some work";
  return `<div class="score"><div class="score-ring" style="--p:${seo.score};--c:${color}"><span>${seo.score}</span></div>
      <div><strong>${verdict}</strong><div class="help">${plural(seo.words, "word")}${seo.keyword ? ` · focus: “${esc(seo.keyword)}”` : ""}</div></div></div>
    <ul class="checks">${seo.checks.map((c) => `<li class="check ${c.ok ? "ok" : "todo"}">
      <span class="check-mark">${icon(c.ok ? "check" : "alert")}</span>
      <div><strong>${esc(c.label)}</strong><span class="help">${esc(c.hint)}</span></div></li>`).join("")}</ul>`;
}

function imageCard(p) {
  return `<div class="image-box">${p.image_src ? `<img src="${esc(p.image_src)}" alt="">` : `<div>${icon("image", "icon-lg")}<div class="small">No image yet</div></div>`}</div>
    <div class="field"><label class="label" for="image-prompt">Describe the image you want <span class="counter">optional</span></label>
      <textarea class="textarea" id="image-prompt" rows="3" style="min-height:72px" placeholder="${esc(p.default_image_prompt)}">${esc(p.image_prompt || "")}</textarea>
      <span class="help">Leave empty to use a prompt based on the title.</span></div>
    <button class="btn btn-block" id="new-image" style="margin-top:12px">${icon("refresh")}<span>${p.image_src ? "Make a new image" : "Create image"}</span></button>`;
}

function publishCard(p, wpReady) {
  const head = `<div class="card-head"><h2>${icon("send")} Publish</h2></div>`;
  if (!wpReady) {
    return `${head}<div class="notice warn">${icon("alert")}<div>Connect your WordPress site to publish with one click.
      <div style="margin-top:10px"><a class="btn btn-sm" href="#/settings#wordpress">Connect WordPress</a></div></div></div>`;
  }
  const links = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      ${p.wp_link ? `<a class="btn btn-sm" href="${esc(p.wp_link)}" target="_blank" rel="noopener">${icon("external", "icon-sm")}View on site</a>` : ""}
      ${p.wp_edit_url ? `<a class="btn btn-sm" href="${esc(p.wp_edit_url)}" target="_blank" rel="noopener">${icon("pen", "icon-sm")}Edit in WordPress</a>` : ""}</div>`;
  if (p.status === "published") {
    return `${head}<div class="notice info">${icon("globe")}<div><strong>Live on your site</strong><div class="help">Published ${esc(ago(p.published_at))}</div></div></div>
      ${links}<button class="btn btn-block" id="publish-btn" style="margin-top:14px">${icon("refresh")}<span>Update live post</span></button>
      <input type="radio" name="mode" value="publish" checked hidden>`;
  }
  const scheduledNote = p.status === "scheduled"
    ? `<div class="notice info" style="margin-bottom:14px">${icon("calendar")}<div><strong>Goes live ${esc(fmtDate(p.scheduled_at))}</strong><div class="help">${esc(ago(p.scheduled_at))}. Change it below if you like.</div></div></div>` : "";
  const draftNote = p.wp_status === "draft" && p.status === "review"
    ? `<div class="notice" style="margin-bottom:14px">${icon("check")}<div>Saved in your WordPress drafts. Publishing will update that draft.</div></div>` : "";
  const defaultMode = p.status === "scheduled" ? "schedule" : "publish";
  const when = p.scheduled_at ? new Date(p.scheduled_at) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; })();
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const option = (value, title, help) => `<label><input type="radio" name="mode" value="${value}" ${value === defaultMode ? "checked" : ""}>
    <div><strong>${title}</strong><span class="help">${help}</span></div></label>`;
  return `${head}${scheduledNote}${draftNote}
    <div class="choice">
      ${option("publish", "Publish now", "Goes live on your site immediately")}
      ${option("schedule", "Schedule", "Pick a date; WordPress publishes it for you")}
      ${option("draft", "Save as WordPress draft", "Finish it later inside WordPress")}
    </div>
    <div id="when" class="field ${defaultMode === "schedule" ? "" : "hidden"}" style="margin-bottom:14px">
      <label class="label" for="when-input">Date and time</label><input class="input" type="datetime-local" id="when-input" value="${local}"></div>
    <button class="btn btn-primary btn-block btn-lg" id="publish-btn">${icon("send")}<span>${defaultMode === "schedule" ? "Schedule post" : "Publish now"}</span></button>
    ${p.wp_post_id ? links : ""}`;
}

/* ==================================================================== */
/* Settings                                                              */
/* ==================================================================== */
async function renderSettings(view) {
  const data = await api("/api/settings");
  const f = data.fields;
  const secretPlaceholder = (field, fallback) => (f[field].set ? `Saved (${f[field].hint || "hidden"}). Paste a new key to replace it` : fallback);
  const statusLine = (key) => `<div class="key-status" data-status="${key}"></div>`;

  view.innerHTML = `<div class="page"><div class="settings">
    <header class="page-head" style="margin-bottom:6px"><div><h1>Settings</h1>
      <p class="muted">Everything is saved in the <code>.env</code> file on this computer. Keys are never shown again or sent anywhere except to their own service.</p></div></header>

    <section class="card">
      <div class="card-head"><h2>${icon("key")} AI services</h2>
        <button class="btn btn-sm" data-test="ai">${icon("refresh", "icon-sm")}<span>Test all</span></button></div>
      <p class="card-sub">All three have free plans. Click <b>Get a free key</b>, sign up, then copy the key here.</p>
      ${SERVICES.filter((s) => s.field).map((s) => `
        <div class="key-row">
          <div><div class="key-name">${s.name}</div><div class="key-role">${s.role}</div>
            <a class="small" href="${s.link}" target="_blank" rel="noopener">Get a free key ${icon("external", "icon-sm")}</a></div>
          <div><div class="key-input">
              <input class="input" type="password" name="${s.field}" autocomplete="off" spellcheck="false" placeholder="${esc(secretPlaceholder(s.field, "Paste your key here"))}">
              <button class="btn" data-test="${s.key}" type="button">Test</button></div>
            ${statusLine(s.key)}</div>
        </div>`).join("")}
    </section>

    <section class="card" id="wordpress">
      <div class="card-head"><h2>${icon("globe")} Your WordPress site</h2>
        <button class="btn btn-sm" data-test="wordpress">${icon("refresh", "icon-sm")}<span>Test</span></button></div>
      <p class="card-sub">Lets Autoblog publish finished posts to your site.</p>
      <div class="field"><label class="label" for="WP_URL">Site address</label>
        <input class="input" id="WP_URL" name="WP_URL" value="${esc(f.WP_URL.value)}" placeholder="https://yourblog.com" autocomplete="off" spellcheck="false">
        <span class="help">Just your site's address is fine; we'll add the rest.</span></div>
      <div class="two-col" style="margin-top:16px">
        <div class="field"><label class="label" for="WP_USER">Username</label>
          <input class="input" id="WP_USER" name="WP_USER" value="${esc(f.WP_USER.value)}" autocomplete="off" spellcheck="false"></div>
        <div class="field"><label class="label" for="WP_APP_PASS">Application password</label>
          <input class="input" id="WP_APP_PASS" type="password" name="WP_APP_PASS" autocomplete="off" placeholder="${esc(secretPlaceholder("WP_APP_PASS", "xxxx xxxx xxxx xxxx xxxx xxxx"))}"></div>
      </div>
      ${statusLine("wordpress")}
      <details style="margin-top:16px"><summary class="small">${icon("chevron", "icon-sm")} How do I get an application password?</summary>
        <ol class="steps-help">
          <li>Log in to your WordPress admin.</li>
          <li>Go to <b>Users → Profile</b> and scroll to <b>Application Passwords</b>.</li>
          <li>Type a name such as <i>Autoblog</i> and click <b>Add New Application Password</b>.</li>
          <li>Copy the password it shows (spaces are fine) and paste it above.</li>
        </ol>
        <p class="help" style="margin-top:8px">It's different from your login password, and you can revoke it any time.</p></details>
    </section>

    <section class="card">
      <div class="card-head"><h2>${icon("pen")} Writing style</h2></div>
      <p class="card-sub">Optional. Helps every post sound like your blog.</p>
      <div class="two-col">
        <div class="field"><label class="label" for="BLOG_AUDIENCE">Who reads your blog?</label>
          <input class="input" id="BLOG_AUDIENCE" name="BLOG_AUDIENCE" value="${esc(f.BLOG_AUDIENCE.value)}" placeholder="e.g. busy parents new to gardening"></div>
        <div class="field"><label class="label" for="BLOG_TONE">Tone of voice</label>
          <input class="input" id="BLOG_TONE" name="BLOG_TONE" value="${esc(f.BLOG_TONE.value)}" placeholder="e.g. friendly, practical, no jargon"></div>
      </div>
    </section>

    <section class="card"><details>
      <summary>${icon("chevron", "icon-sm")} Advanced: AI models</summary>
      <p class="card-sub" style="margin:10px 0 16px">Change these only if a provider retires a model. Leave empty to use the defaults.</p>
      <div class="two-col">
        <div class="field"><label class="label" for="GROQ_MODEL">Outline model (Groq)</label>
          <input class="input" id="GROQ_MODEL" name="GROQ_MODEL" value="${esc(f.GROQ_MODEL.value)}" placeholder="${esc(f.GROQ_MODEL.default)}" spellcheck="false"></div>
        <div class="field"><label class="label" for="GEMINI_MODEL">Article model (Gemini)</label>
          <input class="input" id="GEMINI_MODEL" name="GEMINI_MODEL" value="${esc(f.GEMINI_MODEL.value)}" placeholder="${esc(f.GEMINI_MODEL.default)}" spellcheck="false"></div>
      </div></details></section>
  </div>
  <div class="save-bar" id="save-bar"><span>You have unsaved changes</span>
    <button class="btn btn-sm btn-ghost" id="discard">Discard</button>
    <button class="btn btn-sm btn-primary" id="save">${icon("check", "icon-sm")}<span>Save changes</span></button></div>
  </div>`;

  if (location.hash.endsWith("#wordpress")) $("#wordpress").scrollIntoView({ behavior: "smooth", block: "start" });

  const inputs = $$(".settings input[name]");
  const original = Object.fromEntries(inputs.map((i) => [i.name, i.value]));
  const changed = () => Object.fromEntries(inputs.filter((i) => i.value !== original[i.name]).map((i) => [i.name, i.value]));
  const bar = $("#save-bar");
  const update = () => bar.classList.toggle("show", Object.keys(changed()).length > 0);
  inputs.forEach((i) => i.addEventListener("input", update));

  const showStatus = (key, r) => {
    const box = $(`[data-status="${key}"]`);
    if (box) box.innerHTML = r ? `<span class="dot ${r.level}"></span><span>${esc(r.message)}</span>` : "";
  };
  const checking = (keys) => keys.forEach((k) => { const b = $(`[data-status="${k}"]`); if (b) b.innerHTML = `<span class="dot checking"></span><span>Checking…</span>`; });
  const runTests = async (keys) => {
    checking(keys);
    await Promise.all(keys.map(async (k) => showStatus(k, await api(`/api/test/${k}`, { method: "POST", quiet: true }).catch((e) => ({ level: "error", message: e.message })))));
  };

  const saveChanges = async (button) => {
    const body = changed();
    if (!Object.keys(body).length) return [];
    await withBusy(button, "Saving…", () => api("/api/settings", { method: "PUT", body }));
    inputs.forEach((i) => { if (i.type === "password") i.value = ""; original[i.name] = i.value; });
    update();
    toast("Settings saved.", "success");
    const touched = SERVICES.filter((s) => (s.field && s.field in body) || (s.key === "wordpress" && ["WP_URL", "WP_USER", "WP_APP_PASS"].some((k) => k in body)) || ((body.GROQ_MODEL !== undefined && s.key === "groq") || (body.GEMINI_MODEL !== undefined && s.key === "gemini")));
    return touched.map((s) => s.key);
  };

  $("#save").addEventListener("click", async (e) => {
    const touched = await saveChanges(e.currentTarget);
    if (touched.length) runTests(touched);
    // Refresh placeholders ("Saved (••••abcd)") without losing the page.
    const fresh = await api("/api/settings", { quiet: true }).catch(() => null);
    if (fresh) $$(".settings input[type=password]").forEach((i) => {
      const fld = fresh.fields[i.name];
      if (fld && fld.set) i.placeholder = `Saved (${fld.hint || "hidden"}). Paste a new key to replace it`;
    });
    const wpUrl = fresh?.fields.WP_URL.value;
    if (wpUrl !== undefined) { $("#WP_URL").value = wpUrl; original.WP_URL = wpUrl; }
  });
  $("#discard").addEventListener("click", () => { inputs.forEach((i) => (i.value = original[i.name])); update(); });

  $$("[data-test]").forEach((b) => b.addEventListener("click", async (e) => {
    const which = e.currentTarget.dataset.test;
    if (Object.keys(changed()).length) await saveChanges($("#save"));
    const keys = which === "ai" ? ["groq", "gemini", "pollinations"] : [which];
    await withBusy(e.currentTarget, "Testing…", () => runTests(keys));
  }));

  const leaveGuard = (e) => { if (Object.keys(changed()).length) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", leaveGuard);
  onLeave(() => window.removeEventListener("beforeunload", leaveGuard));

  // Show results from earlier tests, if any.
  api("/api/summary", { quiet: true }).then((s) => Object.entries(s.services).forEach(([k, r]) => showStatus(k, r))).catch(() => {});
}

/* ==================================================================== */
/* Modals                                                                */
/* ==================================================================== */
function openModal(html, { small = false } = {}) {
  const root = $("#modal-root");
  const previous = document.activeElement;
  root.innerHTML = `<div class="modal-backdrop"><div class="modal ${small ? "small" : ""}" role="dialog" aria-modal="true">${html}</div></div>`;
  const backdrop = $(".modal-backdrop", root);
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); previous?.focus?.(); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) close(); });
  $$("[data-close]", root).forEach((b) => b.addEventListener("click", close));
  setTimeout(() => ($("[autofocus]", root) || $("button", root))?.focus(), 30);
  return { root: $(".modal", root), close };
}

function confirmDialog({ title, message, confirm = "OK", danger = false }) {
  return new Promise((resolve) => {
    const { root, close } = openModal(`
      <div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(message)}</p></div></div>
      <div class="modal-foot"><button class="btn" data-close>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confirm-ok" autofocus>${esc(confirm)}</button></div>`, { small: true });
    let answered = false;
    $("#confirm-ok", root).addEventListener("click", () => { answered = true; close(); resolve(true); });
    const observer = new MutationObserver(() => { if (!root.isConnected) { observer.disconnect(); if (!answered) resolve(false); } });
    observer.observe($("#modal-root"), { childList: true });
  });
}

async function openNewPost() {
  const settings = await api("/api/settings", { quiet: true }).catch(() => null);
  const aiReady = settings ? settings.setup.ai_ready : true;
  const { root, close } = openModal(`
    <div class="modal-head"><div><h2>Start new posts</h2><p>What should Autoblog write about? Put each topic on its own line to add several at once.</p></div>
      <button class="icon-btn" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="modal-body">
      ${aiReady ? "" : `<div class="notice warn" style="margin-bottom:14px">${icon("alert")}<div>Add your AI keys in <a href="#/settings" data-close>Settings</a> before writing. You can still save ideas now.</div></div>`}
      <textarea class="textarea" id="topics" rows="5" autofocus placeholder="How to start a vegetable garden on a balcony&#10;Best budget travel tips for students&#10;Beginner's guide to sourdough bread"></textarea>
      <div class="help" id="topic-count" style="margin-top:6px">No topics yet</div>
      <div class="inspire">
        <strong style="display:flex;align-items:center;gap:8px">${icon("bulb")} Need ideas?</strong>
        <p class="help">Tell us what your blog is about and we'll suggest topics people search for.</p>
        <form class="inspire-form" id="suggest-form">
          <input class="input" id="niche" placeholder="e.g. home gardening, personal finance, travel" autocomplete="off">
          <button class="btn" type="submit">${icon("sparkles", "icon-sm")}<span>Suggest</span></button>
        </form>
        <div class="chips" id="chips"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" id="save-ideas">${icon("bulb")}<span>Save as ideas</span></button>
      <button class="btn btn-primary" id="write-now">${icon("sparkles")}<span>Write now</span></button>
    </div>`);

  const topicsEl = $("#topics", root);
  const topics = () => topicsEl.value.split("\n").map((t) => t.trim()).filter(Boolean);
  const count = () => {
    const n = topics().length;
    $("#topic-count", root).textContent = n ? `${plural(n, "topic")}${n > 1 ? "; they'll be written one after another" : ""}` : "No topics yet";
    $("#write-now span", root).textContent = n > 1 ? `Write ${n} posts` : "Write now";
  };
  topicsEl.addEventListener("input", count);

  $("#suggest-form", root).addEventListener("submit", async (e) => {
    e.preventDefault();
    const niche = $("#niche", root).value.trim();
    if (niche.length < 2) return $("#niche", root).focus();
    await withBusy(e.target.querySelector("button"), "Thinking…", async () => {
      const { topics: ideas } = await api("/api/suggest", { method: "POST", body: { niche, count: 8 } });
      $("#chips", root).innerHTML = ideas.map((t) => `<button type="button" class="chip" data-topic="${esc(t)}">${icon("plus")}${esc(t)}</button>`).join("");
    });
  });
  $("#chips", root).addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const t = chip.dataset.topic;
    if (chip.classList.toggle("added")) {
      topicsEl.value = [...topics(), t].join("\n");
      chip.innerHTML = `${icon("check")}${esc(t)}`;
    } else {
      topicsEl.value = topics().filter((x) => x !== t).join("\n");
      chip.innerHTML = `${icon("plus")}${esc(t)}`;
    }
    count();
  });

  const submit = (generate) => async (e) => {
    const list = topics();
    if (!list.length) { toast("Type at least one topic first.", "error"); return topicsEl.focus(); }
    await withBusy(e.currentTarget, generate ? "Starting…" : "Saving…", async () => {
      const { ids } = await api("/api/posts", { method: "POST", body: { topics: list, generate } });
      close();
      if (generate) {
        toast(ids.length > 1 ? `Writing ${plural(ids.length, "post")}. Follow along on the board.` : "Writing has started.", "success");
        location.hash = ids.length === 1 ? `#/post/${ids[0]}` : "#/board";
      } else {
        toast(`Saved ${plural(ids.length, "idea")}.`, "success");
        location.hash = "#/board";
      }
      if (location.hash === "#/board") route();
    });
  };
  $("#save-ideas", root).addEventListener("click", submit(false));
  $("#write-now", root).addEventListener("click", submit(true));
}

/* ==================================================================== */
/* Global actions                                                        */
/* ==================================================================== */
function setTheme(next) {
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch { /* private mode */ }
  updateThemeButton();
}
function currentTheme() {
  return document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
function updateThemeButton() {
  const btn = $(".theme-toggle");
  const dark = currentTheme() === "dark";
  btn.innerHTML = `${icon(dark ? "sun" : "moon")}<span class="theme-label">${dark ? "Light mode" : "Dark mode"}</span>`;
}

document.addEventListener("click", async (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const { action, id } = target.dataset;
  if (action === "new-post") { e.preventDefault(); openNewPost(); }
  if (action === "toggle-theme") setTheme(currentTheme() === "dark" ? "light" : "dark");
  if (action === "retry" || action === "write") {
    e.preventDefault();
    e.stopPropagation();
    await withBusy(target, "Starting…", async () => {
      await api(`/api/posts/${id}/generate`, { method: "POST" });
      toast("Writing has started.", "success");
    });
    route();
  }
});

document.addEventListener("keydown", (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
  if (e.key.toLowerCase() === "n" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && !$("#modal-root").children.length) {
    e.preventDefault();
    openNewPost();
  }
});

window.addEventListener("hashchange", () => {
  // "#/settings#wordpress" is an in-page jump, not a new route
  if (location.hash.startsWith("#/settings#") && $("#wordpress")) return $("#wordpress").scrollIntoView({ behavior: "smooth" });
  route();
});
hydrateIcons();
updateThemeButton();
route();
