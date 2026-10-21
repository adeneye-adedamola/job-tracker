// Job Hunt tracker
// Plain JavaScript, no build step. Data lives in Supabase (see supabase/schema.sql).
// Sections: helpers, data layer, rendering, editor, import/export, sign-in, start-up.
(() => {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const C = window.APP_CONTENT;
  const $ = (sel, root = document) => root.querySelector(sel);
  const DAY = 86400000;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  // ---------- fixed lists ----------
  const TRACKS = C.tracks;
  const STATUSES = [
    { id: "saved", label: "To apply", stage: 0, group: "todo" },
    { id: "applied", label: "Applied", stage: 1, group: "active" },
    { id: "assessment", label: "Assessment", stage: 2, group: "active" },
    { id: "interview", label: "Interview", stage: 3, group: "active" },
    { id: "final", label: "Final stage", stage: 4, group: "active" },
    { id: "offer", label: "Offer", stage: 5, group: "offers" },
    { id: "accepted", label: "Accepted", stage: 5, group: "offers" },
    { id: "rejected", label: "Rejected", stage: null, group: "closed" },
    { id: "noresponse", label: "No response", stage: null, group: "closed" },
    { id: "withdrawn", label: "Withdrawn", stage: null, group: "closed" }
  ];
  const STAGES = ["Not applied yet", "Applied", "Assessment or tests", "Interview", "Final stage", "Offer"];
  const CVS = ["", ...C.cvs];

  // Job agent settings. content.js can override any of these with an "agent" entry.
  const AGENT = Object.assign({
    terms: ["Junior Data Analyst", "Graduate Data Analyst", "IT Support Analyst", "Service Desk Analyst", "CRM Analyst", "Junior Business Analyst",
      "Web Developer", "Website Manager", "WordPress Developer"],
    location: "Hull",
    miles: 25,
    // Skills and words that make a job a better fit, with how much each one counts.
    skills: {
      "python": 3, "sql": 3, "pandas": 2, "scikit": 2, "tensorflow": 2, "machine learning": 3, "nlp": 2, "natural language": 2,
      "data analys": 3, "data scien": 3, "power bi": 1, "tableau": 1, "excel": 1, "statistic": 1, "forecast": 1, "dashboard": 1, "reporting": 1,
      "it support": 3, "service desk": 3, "helpdesk": 2, "help desk": 2, "1st line": 2, "first line": 2, "2nd line": 1, "second line": 1,
      "microsoft 365": 1, "office 365": 1, "wordpress": 3, "salesforce": 2, "crm": 2, "business analys": 3,
      "web develop": 3, "website": 2, "web content": 2, "html": 2, "css": 2, "javascript": 2, "front end": 2, "front-end": 2, "frontend": 2,
      "cms": 2, "content management": 1, "seo": 1, "google analytics": 1, "shopify": 1, "php": 1,
      "graduate": 2, "junior": 2, "entry level": 2, "trainee": 1
    }
  }, C.agent || {});

  // ---------- helpers ----------
  // h("div", {class: "x", onclick: fn}, child, "text") builds an element. Text is always inserted as text, never HTML.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, text) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text != null) el.textContent = text;
    return el;
  }
  function today() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function parseD(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function diff(a, b) { return Math.round((b - a) / DAY); }
  function fmt(d) { return d ? d.getDate() + " " + MON[d.getMonth()] : "—"; }
  const GOAL = parseD(C.goalDate);
  const PLAN_START = parseD(C.planStart);
  const trackName = id => (TRACKS.find(t => t.id === id) || { name: "Other" }).name;
  const statusOf = id => STATUSES.find(s => s.id === id) || STATUSES[1];
  const furthest = a => Number.isFinite(+a.furthest) ? Math.max(0, Math.min(5, +a.furthest)) : (statusOf(a.status).stage || 0);
  const isClosed = a => ["rejected", "noresponse", "withdrawn", "accepted"].includes(a.status);
  const heardBack = a => furthest(a) >= 2 || a.status === "rejected";
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // ---------- state ----------
  let sb = null;            // Supabase client
  let session = null;       // signed-in session
  let apps = [];            // applications, in app (camelCase) shape
  let loaded = false;
  let lastLoad = 0;
  let settings = { weeklyTarget: C.defaultWeeklyTarget || 8, checks: {} };
  let editing = null;
  let recovering = false;   // true while the user is setting a new password after a reset email
  let userRole = null;      // "owner" (can edit), "viewer" (read only) or "pending" (waiting for approval)
  let entered = false;      // true once the signed-in user has been routed to the right screen
  let signupMode = false;   // sign-in screen is showing "create a view-only account"
  let viewers = [];         // view-only requests (owner only); null when the feature isn't set up

  // ---------- data layer ----------
  // Database columns are snake_case; the app uses camelCase.
  const COLS = {
    company: "company", role: "role", track: "track", location: "location", status: "status", furthest: "furthest",
    dateApplied: "date_applied", closingDate: "closing_date", source: "source", cv: "cv", ref: "ref", salary: "salary",
    url: "url", nextAction: "next_action", nextActionDate: "next_action_date", feedback: "feedback", notes: "notes",
    needsUpdate: "needs_update", checkNote: "check_note"
  };
  const DATE_FIELDS = new Set(["dateApplied", "closingDate", "nextActionDate"]);
  const VALID_STATUS = new Set(STATUSES.map(s => s.id));
  const VALID_TRACK = new Set(TRACKS.map(t => t.id));

  function fromRow(r) {
    const a = { id: r.id, createdAt: r.created_at, updatedAt: r.updated_at };
    for (const [k, col] of Object.entries(COLS)) {
      const v = r[col];
      a[k] = v == null ? (k === "furthest" ? 0 : k === "needsUpdate" ? false : "") : v;
    }
    return a;
  }
  function toRow(a) {
    const row = {};
    for (const [k, col] of Object.entries(COLS)) {
      let v = a[k];
      if (k === "furthest") v = Math.max(0, Math.min(5, Math.round(+v || 0)));
      else if (k === "needsUpdate") v = !!v;
      else if (DATE_FIELDS.has(k)) v = parseD(v) ? v : null;
      else v = v == null ? null : String(v).trim();
      row[col] = v;
    }
    if (!VALID_STATUS.has(row.status)) row.status = "saved";
    if (!VALID_TRACK.has(row.track)) row.track = "other";
    return row;
  }

  async function loadData() {
    try {
      const [apRes, stRes] = await Promise.all([
        sb.from("applications").select("*").order("created_at", { ascending: true }),
        sb.from("settings").select("*").maybeSingle()
      ]);
      if (apRes.error) throw apRes.error;
      if (stRes.error) throw stRes.error;
      apps = (apRes.data || []).map(fromRow);
      if (stRes.data) settings = {
        weeklyTarget: stRes.data.weekly_target || C.defaultWeeklyTarget || 8,
        checks: stRes.data.checks && typeof stRes.data.checks === "object" ? stRes.data.checks : {}
      };
      loaded = true; lastLoad = Date.now();
      $("#storeBanner").hidden = true;
      renderAll();
      if (userRole === "owner") loadViewers();
    } catch (err) {
      console.error(err);
      showBanner("Your applications couldn't load. Check your connection, then reload the page. If this keeps happening, your free Supabase project may be paused: open the Supabase dashboard and click Resume project.");
      loaded = true; renderAll();
    }
  }
  async function saveApplication(body, id) {
    const row = toRow(body);
    const query = id
      ? sb.from("applications").update(row).eq("id", id)
      : sb.from("applications").insert({ ...row, user_id: session.user.id });
    const { data, error } = await query.select().single();
    if (error) throw error;
    const saved = fromRow(data);
    apps = id ? apps.map(a => (a.id === id ? saved : a)) : [...apps, saved];
    renderAll();
  }
  async function deleteApplication(id) {
    const { error } = await sb.from("applications").delete().eq("id", id);
    if (error) throw error;
    apps = apps.filter(a => a.id !== id);
    renderAll();
  }
  let settingsChain = Promise.resolve();
  function saveSettings() {
    if (userRole !== "owner") return;
    const body = { user_id: session.user.id, weekly_target: settings.weeklyTarget, checks: settings.checks || {} };
    settingsChain = settingsChain
      .then(async () => { const { error } = await sb.from("settings").upsert(body); if (error) throw error; })
      .catch(err => { console.error(err); toast("Your plan settings didn't save. Try again."); });
  }

  // ---------- rendering: header ----------
  function renderHeader() {
    const name = C.ownerName ? `${C.ownerName}'s Job Hunt` : "Job Hunt";
    document.title = name;
    document.querySelectorAll(".js-title").forEach(el => { el.textContent = name; });
    document.querySelectorAll(".js-owner").forEach(el => { el.textContent = C.ownerName || "The owner"; });
    if (GOAL) {
      const goalText = `${GOAL.getDate()} ${MONTH_LONG[GOAL.getMonth()]} ${GOAL.getFullYear()}`;
      $("#goalLine").textContent = `Application tracker · goal: a job offer by ${goalText}`;
      $("#cdGoal").textContent = `days to ${GOAL.getDate()} ${MONTH_LONG[GOAL.getMonth()]}`;
    }
  }
  function renderCountdown() {
    const t = today();
    const days = Math.max(0, diff(t, GOAL));
    $("#cdDays").textContent = days;
    $("#cdWeeks").textContent = `${Math.floor(days / 7)} weeks and ${days % 7} days left`;
    const strip = $("#weekStrip");
    strip.replaceChildren();
    const thisMon = monday(t);
    const target = settings.weeklyTarget;
    for (let m = monday(PLAN_START); m <= GOAL; m = addDays(m, 7)) {
      const end = addDays(m, 7);
      const n = apps.filter(a => { const d = parseD(a.dateApplied); return d && d >= m && d < end; }).length;
      let cls = "wk", label;
      if (+m === +thisMon) { cls += " now"; label = `This week (from ${fmt(m)}): ${n} of ${target} sent`; }
      else if (m < thisMon) { cls += n >= target ? " hit" : " miss"; label = `Week of ${fmt(m)}: ${n} of ${target} sent`; }
      else label = `Week of ${fmt(m)}: ahead`;
      strip.append(h("div", { class: cls, title: label, "aria-label": label }));
    }
    const weeks = Math.round((monday(GOAL) - monday(PLAN_START)) / (7 * DAY)) + 1;
    $("#pl-h").textContent = `${weeks} weeks to an offer`;
  }

  // ---------- rendering: overview ----------
  function renderKpis() {
    const sent = apps.filter(a => furthest(a) >= 1);
    const heard = sent.filter(heardBack).length;
    const iv = sent.filter(a => furthest(a) >= 3).length;
    const off = sent.filter(a => furthest(a) >= 5).length;
    const m = monday(today()), e = addDays(m, 7);
    const wk = apps.filter(a => { const d = parseD(a.dateApplied); return d && d >= m && d < e; }).length;
    const rate = sent.length ? Math.round(heard / sent.length * 100) : 0;
    const vals = [
      [String(sent.length), "applications submitted"],
      [sent.length ? rate + "%" : "—", sent.length ? `${heard} of ${sent.length} replied` : "replies of any kind"],
      [String(iv), "reached interview stage"],
      [String(off), off === 1 ? "offer received" : "offers received"],
      [null, wk >= settings.weeklyTarget ? "Target hit for this week" : `${settings.weeklyTarget - wk} more to hit your target`]
    ];
    const tiles = $("#kpis").children;
    vals.forEach(([v, s], i) => {
      const vEl = tiles[i].querySelector(".v");
      if (i === 4) vEl.replaceChildren(String(wk), h("small", null, " / " + settings.weeklyTarget));
      else vEl.textContent = loaded ? v : "—";
      tiles[i].querySelector(".s").textContent = s;
    });
  }

  function renderWeekChart() {
    const box = $("#weekChart");
    const W = Math.max(300, Math.round(box.clientWidth || 600)), H = 220;
    const M = { l: 30, r: 12, t: 22, b: 30 };
    const iw = W - M.l - M.r, ih = H - M.t - M.b;
    const thisMon = monday(today());
    const dated = apps.map(a => ({ a, d: parseD(a.dateApplied) })).filter(x => x.d);
    const earliest = dated.length ? Math.min(...dated.map(x => +x.d)) : +addDays(thisMon, -42);
    const start = monday(new Date(Math.min(earliest, +addDays(thisMon, -42))));
    const end = monday(GOAL);
    const weeks = [];
    for (let m = new Date(start); m <= end; m = addDays(m, 7)) weeks.push({ mon: new Date(m), items: [] });
    for (const x of dated) {
      const i = Math.round((monday(x.d) - start) / (7 * DAY));
      if (weeks[i]) weeks[i].items.push(x.a);
    }
    const target = settings.weeklyTarget;
    const maxN = Math.max(target, ...weeks.map(w => w.items.length));
    const step = maxN <= 6 ? 1 : maxN <= 12 ? 2 : 5;
    const ymax = Math.ceil((maxN + 1) / step) * step;
    const y = v => M.t + ih - (v / ymax) * ih;
    const band = iw / weeks.length;
    const bw = Math.max(3, Math.min(24, band * 0.62));
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `Applications per week from ${fmt(start)} to ${fmt(end)}. Weekly target ${target}.` });

    const nowIdx = Math.round((thisMon - start) / (7 * DAY));
    if (nowIdx < weeks.length - 1) {                       // shade the weeks still ahead
      const fx = M.l + (nowIdx + 1) * band;
      svg.append(sv("rect", { x: fx, y: M.t, width: M.l + iw - fx, height: ih, fill: "var(--soft)", opacity: 0.6, rx: 4 }));
      svg.append(sv("text", { x: M.l + iw - 4, y: M.t + 12, "text-anchor": "end" }, "Ahead to goal"));
    }
    for (let v = 0; v <= ymax; v += step) {               // gridlines and y labels
      svg.append(sv("line", { x1: M.l, x2: M.l + iw, y1: y(v), y2: y(v), stroke: "var(--line)", "stroke-width": 1 }));
      svg.append(sv("text", { x: M.l - 8, y: y(v) + 3.5, "text-anchor": "end" }, v));
    }
    weeks.forEach((w, i) => {                             // month labels
      if (w.mon.getDate() <= 7) svg.append(sv("text", { x: M.l + i * band + band / 2, y: H - 10, "text-anchor": "middle" }, MON[w.mon.getMonth()]));
    });
    weeks.forEach((w, i) => {                             // bars, rounded at the top only
      const n = w.items.length;
      if (!n) return;
      const x = M.l + i * band + (band - bw) / 2, top = y(n), base = y(0), r = Math.min(4, bw / 2, base - top);
      const d = `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${base} Z`;
      svg.append(sv("path", { d, fill: i === nowIdx ? "var(--accent)" : "var(--blue)" }));
    });
    svg.append(sv("line", { x1: M.l, x2: M.l + iw, y1: y(target), y2: y(target), stroke: "var(--ink)", "stroke-width": 1.5, "stroke-dasharray": "5 4", opacity: 0.55 }));
    svg.append(sv("text", { x: M.l + 4, y: y(target) - 6 }, `Target ${target} a week`));
    if (nowIdx >= 0 && nowIdx < weeks.length) {
      const nx = M.l + nowIdx * band + band / 2;
      svg.append(sv("line", { x1: nx, x2: nx, y1: M.t - 6, y2: M.t + ih, stroke: "var(--accent)", "stroke-width": 1 }));
      svg.append(sv("text", { x: nx, y: M.t - 9, "text-anchor": "middle", fill: "var(--accent-ink)" }, "Now"));
    }
    const tip = h("div", { class: "tip", hidden: true });
    weeks.forEach((w, i) => {                             // hover and focus targets for the tooltip
      const hit = sv("rect", { x: M.l + i * band, y: M.t, width: band, height: ih, fill: "transparent", tabindex: 0 });
      const show = () => {
        const n = w.items.length;
        tip.replaceChildren(h("b", null, `Week of ${fmt(w.mon)}`), h("br"), `${n} ${n === 1 ? "application" : "applications"}` + (w.mon > thisMon ? " (ahead)" : ""));
        w.items.slice(0, 4).forEach(a => tip.append(h("br"), "· " + (a.company || "") + (a.role ? ", " + a.role : "")));
        if (n > 4) tip.append(h("br"), `+ ${n - 4} more`);
        tip.hidden = false;
        const bx = box.getBoundingClientRect();
        const px = (M.l + i * band + band / 2) / W * bx.width;
        tip.style.left = Math.max(0, Math.min(bx.width - tip.offsetWidth, px - tip.offsetWidth / 2)) + "px";
        tip.style.top = "0px";
      };
      const hide = () => { tip.hidden = true; };
      hit.addEventListener("pointerenter", show); hit.addEventListener("focus", show);
      hit.addEventListener("pointerleave", hide); hit.addEventListener("blur", hide);
      svg.append(hit);
    });
    box.replaceChildren(svg, tip);
    $("#weekCaption").textContent = dated.length
      ? `Each bar is one week, Monday to Sunday. The dashed line is your target of ${target} a week. Applications without a date are left out.`
      : "Bars appear here as you log application dates. The dashed line is your weekly target.";
  }

  function renderAttention() {
    const t = today(), items = [];
    for (const a of apps) {
      if (a.needsUpdate) items.push({ a, kind: "check", tag: "Check status", why: a.checkNote || "Confirm the latest status.", prio: 1 });
      const na = parseD(a.nextActionDate);
      if (a.nextAction && na && !isClosed(a) && diff(t, na) <= 7) {
        const late = diff(t, na) < 0;
        items.push({ a, kind: late ? "overdue" : "due", tag: late ? "Overdue" : (diff(t, na) === 0 ? "Due today" : "Due " + fmt(na)), why: a.nextAction, when: +na, prio: late ? 0 : 2 });
      }
      const cl = parseD(a.closingDate);
      if (a.status === "saved" && cl && diff(t, cl) >= 0 && diff(t, cl) <= 21) items.push({ a, kind: "closing", tag: "Closes " + fmt(cl), why: "Not submitted yet.", when: +cl, prio: 1 });
      const ap = parseD(a.dateApplied);
      if (a.status === "applied" && ap && !a.needsUpdate && diff(ap, t) > 21) items.push({ a, kind: "stale", tag: "Follow up", why: `No reply in ${diff(ap, t)} days. Chase it, or mark it No response.`, prio: 3 });
    }
    items.sort((x, y) => x.prio - y.prio || (x.when || 0) - (y.when || 0));
    const ul = $("#attention");
    ul.replaceChildren();
    if (!loaded) { ul.append(h("li", { class: "empty" }, "Loading your applications…")); return; }
    if (!items.length) { ul.append(h("li", { class: "empty" }, "All clear. Nothing is overdue or waiting on you.")); return; }
    for (const it of items.slice(0, 8)) {
      ul.append(h("li", null, h("button", { type: "button", onclick: () => openEditor(it.a) },
        h("span", { class: "chip nodot k-" + it.kind }, it.tag),
        h("span", { class: "what" }, `${it.a.role || "Role"} · ${it.a.company || "Company"}`),
        h("span", { class: "why" }, it.why))));
    }
    if (items.length > 8) ul.append(h("li", { class: "empty" }, `${items.length - 8} more in the table below.`));
  }

  // ---------- rendering: applications table ----------
  function filteredApps() {
    const q = $("#q").value.trim().toLowerCase();
    const fs = $("#fStatus").value, ft = $("#fTrack").value, sort = $("#fSort").value;
    const list = apps.filter(a => {
      if (fs !== "all" && statusOf(a.status).group !== fs) return false;
      if (ft !== "all" && (a.track || "other") !== ft) return false;
      if (q && ![a.company, a.role, a.ref, a.location].some(v => (v || "").toLowerCase().includes(q))) return false;
      return true;
    });
    const key = a => +(parseD(a.dateApplied) || parseD((a.createdAt || "").slice(0, 10)) || 0);
    if (sort === "recent") list.sort((x, y) => key(y) - key(x));
    if (sort === "closing") list.sort((x, y) => (+(parseD(x.closingDate) || 9e15)) - (+(parseD(y.closingDate) || 9e15)));
    if (sort === "stage") list.sort((x, y) => furthest(y) - furthest(x) || key(y) - key(x));
    return list;
  }
  function renderTable() {
    const tb = $("#rows");
    tb.replaceChildren();
    if (!loaded) { tb.append(h("tr", null, h("td", { colspan: 6, class: "empty" }, "Loading your applications…"))); $("#countLbl").textContent = ""; return; }
    const list = filteredApps();
    $("#countLbl").textContent = `${list.length} of ${apps.length}`;
    if (!apps.length) { tb.append(h("tr", null, h("td", { colspan: 6, class: "empty" }, "No applications yet. Use Add application to log your first one, or Import applications under Your data."))); return; }
    if (!list.length) { tb.append(h("tr", null, h("td", { colspan: 6, class: "empty" }, "Nothing matches these filters."))); return; }
    const t = today();
    for (const a of list) {
      const st = statusOf(a.status);
      const cl = parseD(a.closingDate), na = parseD(a.nextActionDate);
      const tags = [];
      if (a.needsUpdate) tags.push(h("span", { class: "chip nodot k-check" }, "Check status"));
      if (a.feedback) tags.push(h("span", { class: "chip nodot" }, "Feedback"));
      if (st.stage === null && furthest(a) >= 2) tags.push(h("span", { class: "chip nodot" }, "Reached " + STAGES[furthest(a)].toLowerCase()));
      tb.append(h("tr", { tabindex: 0, onclick: () => openEditor(a), onkeydown: e => { if (e.key === "Enter") openEditor(a); } },
        h("td", null,
          h("span", { class: "role" }, a.role || "Untitled role"),
          h("span", { class: "co" }, [a.company, a.location].filter(Boolean).join(" · ")),
          a.ref ? h("span", { class: "ref" }, " · " + a.ref) : null,
          tags.length ? h("div", { class: "tags" }, tags) : null),
        h("td", null, trackName(a.track)),
        h("td", null, h("span", { class: "chip s-" + st.id }, st.label)),
        h("td", { class: "date" }, fmt(parseD(a.dateApplied))),
        h("td", { class: "date" }, cl ? fmt(cl) + (a.status === "saved" && diff(t, cl) >= 0 ? ` (${diff(t, cl)}d)` : "") : "—"),
        h("td", null, a.nextAction ? h("span", null, a.nextAction, na ? h("span", { class: "co" }, " · " + fmt(na)) : null) : h("span", { class: "co" }, "—"))
      ));
    }
  }

  // ---------- rendering: feedback and trends ----------
  function renderFunnel() {
    const box = $("#funnel");
    box.replaceChildren();
    const sent = apps.filter(a => furthest(a) >= 1);
    if (!sent.length) { box.append(h("p", { class: "empty" }, "Your funnel fills in once you log applications as Applied.")); return; }
    const steps = [["Sent", sent.length], ["Heard back", sent.filter(heardBack).length], ["Interview", sent.filter(a => furthest(a) >= 3).length], ["Offer", sent.filter(a => furthest(a) >= 5).length]];
    for (const [lbl, n] of steps) {
      const pct = Math.round(n / sent.length * 100);
      const fill = h("div", { class: "bar-fill" });
      fill.style.width = (n ? Math.max(2, pct) : 0) + "%";
      box.append(h("div", { class: "bar-row" }, h("span", { class: "lbl" }, lbl),
        h("div", { class: "bar-track", role: "img", "aria-label": `${lbl}: ${n}, ${pct}% of sent` }, fill),
        h("span", { class: "num" }, `${n} · ${pct}%`)));
    }
  }
  function renderDrop() {
    const t = today();
    const closed = apps.filter(a => ["rejected", "noresponse", "withdrawn"].includes(a.status));
    const stale = apps.filter(a => a.status === "applied" && !a.needsUpdate && parseD(a.dateApplied) && diff(parseD(a.dateApplied), t) > 21);
    const cv = closed.filter(a => furthest(a) <= 1).length + stale.length;
    const tests = closed.filter(a => furthest(a) === 2).length;
    const iv = closed.filter(a => furthest(a) >= 3).length;
    const max = Math.max(cv, tests, iv);
    const box = $("#drop");
    box.replaceChildren();
    for (const [n, l] of [[cv, "at CV screen or no reply"], [tests, "after tests"], [iv, "after interview"]]) {
      box.append(h("div", { class: max > 0 && n === max ? "top-stop" : "" }, h("span", { class: "n" }, n), h("span", { class: "l" }, l)));
    }
    let msg;
    if (cv + tests + iv < 3) msg = "Too early to call. Once three or more applications close, this shows where you tend to drop out. Mark rejections and silent applications as you hear.";
    else if (max === cv) msg = "Most applications stop before any test or interview. Sharpen the CV match: mirror the advert's keywords, lead with your most relevant project, and use the right CV for the track.";
    else if (max === tests) msg = "You pass the CV screen but stop at tests. Practise numerical, verbal and situational judgement tests for 20 minutes a day.";
    else msg = "You reach interviews but are not converting. Rehearse STAR answers out loud, record a mock video interview, and ask every employer for feedback.";
    $("#verdict").textContent = msg;
  }
  function renderByTrack() {
    const box = $("#byTrack");
    box.replaceChildren();
    const rows = TRACKS.map(tk => {
      const list = apps.filter(a => (a.track || "other") === tk.id && furthest(a) >= 1);
      return { tk, sent: list.length, heard: list.filter(heardBack).length, iv: list.filter(a => furthest(a) >= 3).length };
    }).filter(r => r.sent).sort((a, b) => b.sent - a.sent);
    if (!rows.length) { box.append(h("p", { class: "empty" }, "Each track gets a bar once you send an application in it.")); return; }
    const max = Math.max(...rows.map(r => r.sent));
    for (const r of rows) {
      const s = h("div", { class: "bar-fill sent" }); s.style.width = (r.sent / max * 100) + "%";
      const hb = h("div", { class: "bar-fill heard" }); hb.style.width = (r.heard / max * 100) + "%";
      box.append(h("div", { class: "bar-row" }, h("span", { class: "lbl" }, r.tk.name),
        h("div", { class: "bar-track", role: "img", "aria-label": `${r.tk.name}: ${r.sent} sent, ${r.heard} heard back` }, s, hb),
        h("span", { class: "num" }, `${r.heard}/${r.sent} replied` + (r.iv ? ` · ${r.iv} int.` : ""))));
    }
  }
  function renderFeedback() {
    const ul = $("#fbList");
    ul.replaceChildren();
    const list = apps.filter(a => (a.feedback || "").trim()).sort((x, y) => (y.updatedAt || "").localeCompare(x.updatedAt || ""));
    if (!list.length) { ul.append(h("li", { class: "empty" }, "No feedback logged yet. When an employer tells you why, paste it into that application.")); return; }
    for (const a of list.slice(0, 8)) {
      ul.append(h("li", null, h("span", { class: "small muted" }, `${a.role} · ${a.company} · ${statusOf(a.status).label}`), h("span", { class: "q" }, a.feedback)));
    }
  }

  // ---------- rendering: tracks and plan ----------
  function renderTracks() {
    const box = $("#trackCards");
    box.replaceChildren();
    for (const tk of TRACKS.filter(t => t.fit)) {
      const list = apps.filter(a => (a.track || "other") === tk.id);
      const sent = list.filter(a => furthest(a) >= 1);
      const heard = sent.filter(heardBack).length;
      const todo = list.filter(a => a.status === "saved").length;
      box.append(h("article", { class: "track" + (tk.best ? " best" : "") },
        h("div", { class: "meta" }, tk.best ? h("span", { class: "chip nodot s-interview" }, "Best bet before your goal") : null, h("span", { class: "chip nodot" }, tk.pace)),
        h("h3", null, tk.name),
        h("p", { class: "fit" }, tk.fit),
        h("div", null, h("p", { class: "eyebrow sub" }, "Search for"), h("ul", null, tk.titles.map(x => h("li", null, x)))),
        h("p", { class: "small" }, h("span", { class: "muted" }, "Use: "), tk.cv),
        h("p", { class: "live" }, loaded ? `${sent.length} sent · ${heard} heard back` + (todo ? ` · ${todo} to apply` : "") : "—")));
    }
  }
  function renderPlan() {
    const box = $("#phases");
    box.replaceChildren();
    const t = today();
    for (const p of C.phases) {
      const s = parseD(p.start), e = parseD(p.end);
      const state = t > e ? "past" : (t >= s ? "current" : "");
      const tasks = p.tasks.map((task, i) => {
        const key = p.id + "-" + i;
        const cb = h("input", { type: "checkbox", id: "chk-" + key });
        cb.checked = !!settings.checks[key];
        cb.disabled = userRole !== "owner";
        cb.addEventListener("change", () => { settings.checks = { ...settings.checks, [key]: cb.checked }; saveSettings(); renderPlan(); });
        return h("li", null, h("label", { for: "chk-" + key }, cb, h("span", null, task)));
      });
      const done = p.tasks.filter((_, i) => settings.checks[p.id + "-" + i]).length;
      box.append(h("article", { class: "phase " + state },
        h("div", { class: "meta" }, h("span", { class: "dates" }, `${fmt(s)} to ${fmt(e)}`),
          state === "current" ? h("span", { class: "chip nodot s-interview" }, "Now") : h("span", { class: "count" }, `${done}/${p.tasks.length}`)),
        h("h3", null, p.name),
        h("p", { class: "goal muted" }, p.goal),
        h("ul", { class: "checks" }, tasks)));
    }
    const tgt = $("#target");
    if (document.activeElement !== tgt) tgt.value = settings.weeklyTarget;
    tgt.disabled = userRole !== "owner";
  }

  function renderAll() {
    renderHeader(); renderCountdown(); renderKpis(); renderWeekChart(); renderAttention(); renderTable();
    renderFunnel(); renderDrop(); renderByTrack(); renderFeedback(); renderTracks(); renderPlan();
    $("#whoLbl").textContent = session ? "Signed in as " + session.user.email + (userRole === "viewer" ? " (view only)" : "") : "";
    const rb = $("#roleBanner");
    rb.hidden = userRole !== "viewer";
    if (userRole === "viewer") rb.textContent = `View only. You're looking at ${C.ownerName || "the owner"}'s tracker, and only ${C.ownerName || "they"} can make changes.`;
  }
  function showBanner(text) { const b = $("#storeBanner"); b.textContent = text; b.hidden = false; }

  // ---------- editor ----------
  function fillSelect(sel, opts) { sel.replaceChildren(...opts.map(([v, l]) => h("option", { value: v }, l))); }
  function openEditor(a) {
    editing = a || null;
    $("#edTitle").textContent = a ? (a.role || "Application") : "Add application";
    $("#edEyebrow").textContent = a ? (a.company || "Application") : "New application";
    const chk = $("#edCheck");
    if (a && a.needsUpdate) { chk.hidden = false; chk.textContent = (a.checkNote || "Confirm the latest status.") + " Saving clears this reminder."; }
    else chk.hidden = true;
    const v = a || { track: "data", status: "saved", furthest: 0, cv: "" };
    $("#f-company").value = v.company || "";
    $("#f-role").value = v.role || "";
    $("#f-track").value = VALID_TRACK.has(v.track) ? v.track : "other";
    $("#f-location").value = v.location || "";
    $("#f-status").value = v.status || "saved";
    $("#f-furthest").value = String(furthest(v));
    $("#f-applied").value = v.dateApplied || "";
    $("#f-closing").value = v.closingDate || "";
    $("#f-source").value = v.source || "";
    $("#f-cv").value = CVS.includes(v.cv || "") ? (v.cv || "") : "Other";
    $("#f-ref").value = v.ref || "";
    $("#f-salary").value = v.salary || "";
    $("#f-url").value = v.url || "";
    $("#f-next").value = v.nextAction || "";
    $("#f-nextdate").value = v.nextActionDate || "";
    $("#f-feedback").value = v.feedback || "";
    $("#f-notes").value = v.notes || "";
    const ro = userRole !== "owner";
    for (const el of $("#edForm").elements) el.disabled = ro;
    const del = $("#edDelete");
    del.hidden = !a || ro; del.classList.remove("armed"); del.textContent = "Delete";
    $("#edSave").hidden = ro;
    $("#edCancel").textContent = ro ? "Close" : "Cancel";
    if (ro) chk.hidden = true;
    $("#editor").hidden = false;
    setTimeout(() => (ro ? $("#edClose") : $("#f-company")).focus(), 30);
  }
  function closeEditor() { $("#editor").hidden = true; editing = null; }
  async function saveEditor() {
    const company = $("#f-company").value.trim(), role = $("#f-role").value.trim();
    if (!company || !role) { toast("Add a company and a role first."); (company ? $("#f-role") : $("#f-company")).focus(); return; }
    const status = $("#f-status").value;
    let fur = +$("#f-furthest").value;
    const stg = statusOf(status).stage;
    if (stg !== null) fur = Math.max(fur, stg);
    if (["rejected", "noresponse"].includes(status)) fur = Math.max(fur, 1);
    let applied = $("#f-applied").value;
    if (!applied && fur >= 1 && !editing) applied = iso(today());
    const body = {
      company, role, track: $("#f-track").value, location: $("#f-location").value, status, furthest: fur,
      dateApplied: applied, closingDate: $("#f-closing").value, source: $("#f-source").value, cv: $("#f-cv").value,
      ref: $("#f-ref").value, salary: $("#f-salary").value, url: $("#f-url").value,
      nextAction: $("#f-next").value, nextActionDate: $("#f-nextdate").value,
      feedback: $("#f-feedback").value, notes: $("#f-notes").value, needsUpdate: false, checkNote: ""
    };
    const btn = $("#edSave");
    btn.disabled = true;
    try {
      const wasEditing = !!editing;
      await saveApplication(body, editing && editing.id);
      closeEditor();
      toast(wasEditing ? "Application updated" : "Application added");
    } catch (err) {
      console.error(err);
      toast("That didn't save. Check your connection and try again.");
    } finally { btn.disabled = false; }
  }
  async function deleteEditing() {
    const del = $("#edDelete");
    if (!del.classList.contains("armed")) { del.classList.add("armed"); del.textContent = "Tap again to delete"; return; }
    try { await deleteApplication(editing.id); closeEditor(); toast("Application deleted"); }
    catch (err) { console.error(err); toast("That didn't delete. Try again."); }
  }

  // ---------- job agent ----------
  // Searches Reed through the find-jobs function in Supabase, then scores each job here in the browser.
  let agentJobs = [];
  let agentShown = 24;
  let agentSearched = false;
  const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const SKILL_RES = Object.entries(AGENT.skills).map(([k, w]) => [k, +w || 0, new RegExp("(^|[^a-z0-9])" + escapeRe(k.toLowerCase()), "i")]);
  function readStore(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  function writeStore(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing */ } }
  const hiddenJobs = () => new Set(readStore("jobAgentHidden", []));
  let agentSponsorList = true;   // false when the sponsor list hasn't been loaded yet

  // Sponsorship label for a job: what the advert says first, then the register of licensed sponsors.
  function sponsorInfo(j) {
    const s = j.sponsor || {};
    if (s.advert === "no") return { key: "no", text: "No sponsorship", cls: "k-overdue" };
    if (s.advert === "yes") return { key: "yes", text: s.licensed ? "Sponsorship offered (licensed)" : "Sponsorship offered", cls: "s-offer" };
    if (s.licensed) return { key: "licensed", text: "Licensed sponsor", cls: "s-applied" };
    if (s.advert === "rtw") return { key: "rtw", text: "Needs right to work", cls: "k-check" };
    if (s.agency) return { key: "agency", text: "Agency: ask about sponsorship", cls: "" };
    return { key: "unknown", text: "Sponsorship unknown", cls: "" };
  }
  const canSponsor = j => { const k = sponsorInfo(j).key; return k === "yes" || k === "licensed"; };
  const SKILL_LABELS = { "data analys": "data analysis", "data scien": "data science", "business analys": "business analysis",
    "scikit": "scikit-learn", "statistic": "statistics", "forecast": "forecasting", "sql": "SQL", "python": "Python", "nlp": "NLP",
    "crm": "CRM", "power bi": "Power BI", "it support": "IT support", "microsoft 365": "Microsoft 365", "office 365": "Office 365",
    "wordpress": "WordPress", "salesforce": "Salesforce", "tensorflow": "TensorFlow", "excel": "Excel", "tableau": "Tableau",
    "web develop": "web development", "html": "HTML", "css": "CSS", "javascript": "JavaScript", "cms": "CMS", "seo": "SEO", "php": "PHP",
    "front-end": "front end", "frontend": "front end", "google analytics": "Google Analytics", "shopify": "Shopify" };

  function scoreJob(j) {
    const title = (j.title || "").toLowerCase();
    const text = (title + " " + (j.summary || "")).toLowerCase();
    let raw = 0;
    const hits = [];
    for (const [k, w, re] of SKILL_RES) {
      if (re.test(text)) { raw += w * (re.test(title) ? 2 : 1); hits.push(SKILL_LABELS[k] || k); }
    }
    let score = Math.min(100, raw / 16 * 100);
    const flags = [], good = [];
    if (/\b(senior|sr\.?|lead|principal|head of|director)\b/i.test(j.title || "")) { flags.push("Senior role"); score *= 0.5; }
    const years = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:years|yrs)/g)].map(m => +m[1]).filter(n => n >= 3 && n <= 20);
    if (years.length) { flags.push(`Asks for ${Math.max(...years)}+ years`); score *= 0.7; }
    if (/security clearance|\b(sc|dv)\b (cleared|clearance)/i.test(text)) { flags.push("Security clearance"); score *= 0.8; }
    if (/driving licen[cs]e|own (car|vehicle|transport)/i.test(text)) flags.push("Driving licence");
    if (/\bphd\b|doctorate/i.test(text)) { flags.push("PhD"); score *= 0.7; }
    if (/\bgraduate\b|\bentry[- ]level\b|\bjunior\b|\btrainee\b/i.test(text)) good.push("Entry level");
    if (/\bremote\b|work from home/i.test(text)) good.push("Remote");
    else if (/\bhybrid\b/i.test(text)) good.push("Hybrid");
    return { score: Math.round(score), hits: hits.slice(0, 6), flags, good };
  }
  function guessTrack(j) {
    const t = ((j.title || "") + " " + (j.summary || "")).toLowerCase();
    if (/graduate (scheme|programme|program)/.test(t)) return "grad";
    if (/web develop|website|wordpress|front[- ]?end|web content|\bcms\b/.test(t)) return "it";
    if (/it support|service desk|help ?desk|technician|1st line|2nd line|first line|second line/.test(t)) return "it";
    if (/business analys|\bcrm\b|salesforce/.test(t)) return "ba";
    if (/\bdata\b|analyst|insight|reporting|machine learning|scien/.test(t)) return "data";
    if (/recruitment|admissions|student/.test(t)) return "edu";
    if (/security officer|door supervisor|\bsia\b/.test(t)) return "security";
    return "other";
  }
  const money = n => "£" + Math.round(n).toLocaleString("en-GB");
  function salaryText(j) {
    if (j.salaryMin && j.salaryMax && j.salaryMax !== j.salaryMin) return `${money(j.salaryMin)} to ${money(j.salaryMax)}`;
    if (j.salaryMin || j.salaryMax) return money(j.salaryMin || j.salaryMax);
    return "";
  }
  function inTracker(j) {
    const co = (j.employer || "").toLowerCase(), ro = (j.title || "").toLowerCase();
    return apps.some(a => (j.url && a.url === j.url) || a.ref === j.id || a.ref === "Reed " + j.id ||
      ((a.company || "").toLowerCase() === co && (a.role || "").toLowerCase() === ro));
  }
  async function addJobToTracker(j, btn) {
    const track = guessTrack(j);
    const tk = TRACKS.find(t => t.id === track);
    const closes = parseD(j.closes);
    let next = closes ? addDays(closes, -2) : addDays(today(), 3);
    if (next < today()) next = today();
    btn.disabled = true;
    try {
      await saveApplication({
        company: j.employer || "Unknown employer", role: j.title, track, location: j.location, status: "saved", furthest: 0,
        dateApplied: "", closingDate: j.closes || "", source: (j.source || "Reed") + " (job agent)", cv: tk && CVS.includes(tk.cv) ? tk.cv : "",
        ref: j.id, salary: salaryText(j), url: j.url, nextAction: "Apply", nextActionDate: iso(next),
        feedback: "", notes: ("Sponsorship: " + sponsorInfo(j).text + ". " + (j.summary || "")).slice(0, 450), needsUpdate: false, checkNote: ""
      }, null);
      toast("Added to your tracker as To apply");
      renderAgentResults();
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      toast("That didn't save. Try again.");
    }
  }
  function jobCard(j) {
    const label = j.score >= 70 ? "Strong match" : j.score >= 45 ? "Good match" : j.score >= 20 ? "Possible match" : "Weak match";
    const fill = h("div", { class: "bar-fill" });
    fill.style.width = Math.max(3, j.score) + "%";
    const added = inTracker(j);
    const addBtn = h("button", { class: "btn small" + (added ? "" : " primary"), type: "button" }, added ? "In your tracker" : "Add to tracker");
    if (added) addBtn.disabled = true;
    else addBtn.addEventListener("click", () => addJobToTracker(j, addBtn));
    const hideBtn = h("button", { class: "btn small", type: "button" }, "Hide");
    hideBtn.addEventListener("click", () => {
      const hid = hiddenJobs(); hid.add(j.id); writeStore("jobAgentHidden", [...hid]);
      renderAgentResults();
    });
    const posted = parseD(j.posted), closes = parseD(j.closes);
    const summary = (j.summary || "").length > 220 ? j.summary.slice(0, 217).trimEnd() + "…" : (j.summary || "");
    const link = /^https:\/\//.test(j.url || "") ? j.url : (j.source === "Adzuna" ? "https://www.adzuna.co.uk" : "https://www.reed.co.uk");
    return h("article", { class: "track" + (j.score >= 70 ? " best" : "") },
      h("div", { class: "meta" },
        h("span", { class: "chip nodot " + (j.score >= 70 ? "s-offer" : j.score >= 45 ? "s-applied" : "") }, `${label} · ${j.score}%`),
        posted ? h("span", { class: "chip nodot" }, "Posted " + fmt(posted)) : null,
        h("span", { class: "chip nodot " + sponsorInfo(j).cls, title: "Based on the advert text and the UK register of licensed sponsors. Always confirm with the employer." }, sponsorInfo(j).text),
        h("span", { class: "chip nodot" }, (j.source || "Reed") + (j.alsoOn && j.alsoOn.length ? " · also on " + j.alsoOn.join(", ") : ""))),
      h("h3", null, j.title || "Untitled job"),
      h("p", { class: "small muted" }, [j.employer, j.location].filter(Boolean).join(" · ")),
      h("div", { class: "bar-track", role: "img", "aria-label": `${j.score}% match` }, fill),
      h("p", { class: "small" }, [salaryText(j) || "Salary not shown", closes ? "Closes " + fmt(closes) : ""].filter(Boolean).join(" · ")),
      (j.good.length || j.flags.length || j.hits.length) ? h("div", { class: "meta" },
        j.good.map(x => h("span", { class: "chip nodot s-offer" }, x)),
        j.flags.map(x => h("span", { class: "chip nodot k-overdue" }, x)),
        j.hits.map(x => h("span", { class: "chip nodot" }, x))) : null,
      summary ? h("p", { class: "small muted" }, summary) : null,
      h("div", { class: "data-actions" },
        h("a", { class: "btn small", href: link, target: "_blank", rel: "noopener", style: "text-decoration:none" }, "View on " + (j.source || "Reed")),
        addBtn, hideBtn));
  }
  function renderAgentResults() {
    const box = $("#ag-results");
    box.replaceChildren();
    if (!agentSearched) { box.append(h("p", { class: "empty" }, "Your matches will appear here. Check the job titles above, then tap Find jobs.")); return; }
    const hid = hiddenJobs();
    const notHidden = agentJobs.filter(j => !hid.has(j.id));
    const hiddenHere = agentJobs.length - notHidden.length;
    const sf = $("#ag-sponsor").value;
    const list = notHidden.filter(j => sf === "can" ? canSponsor(j) : sf === "hide-no" ? sponsorInfo(j).key !== "no" : true);
    if (!agentSponsorList) box.append(h("p", { class: "small muted" }, "Sponsor labels only use the advert text right now. Load the sponsor list in Your data to check employers too."));
    if (!list.length) box.append(h("p", { class: "empty" }, !agentJobs.length ? "No jobs found. Try wider distance or different job titles." : !notHidden.length ? "You've hidden every job from this search." : "No jobs match the sponsorship filter. Choose All jobs to see the rest."));
    else {
      const grid = h("div", { class: "tracks" });
      list.slice(0, agentShown).forEach(j => grid.append(jobCard(j)));
      box.append(grid);
    }
    const foot = h("div", { class: "data-actions" });
    if (list.length > agentShown) {
      const more = h("button", { class: "btn", type: "button" }, `Show ${Math.min(24, list.length - agentShown)} more`);
      more.addEventListener("click", () => { agentShown += 24; renderAgentResults(); });
      foot.append(more);
    }
    if (hiddenHere) {
      const unhide = h("button", { class: "btn small", type: "button" }, `Show ${hiddenHere} hidden`);
      unhide.addEventListener("click", () => { writeStore("jobAgentHidden", []); renderAgentResults(); });
      foot.append(unhide);
    }
    if (foot.childNodes.length) box.append(foot);
  }
  async function runAgent(e) {
    e.preventDefault();
    const terms = $("#ag-terms").value.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 10);
    const miles = +$("#ag-miles").value;
    const location = miles ? $("#ag-location").value.trim() : "";
    const status = $("#ag-status");
    if (!terms.length) { status.textContent = "Add at least one job title."; return; }
    if (miles && !location) { status.textContent = "Add a location, or choose Anywhere in the UK."; return; }
    writeStore("jobAgentForm", { terms: terms.join("\n"), location: $("#ag-location").value.trim(), miles });
    const btn = $("#ag-go");
    btn.disabled = true;
    status.textContent = `Searching for ${terms.length} job ${terms.length === 1 ? "title" : "titles"}…`;
    try {
      const { data, error } = await sb.functions.invoke("find-jobs", { body: { terms, location, miles } });
      if (error) {
        let msg = "The job agent couldn't be reached. Check your connection and try again.";
        const ctx = error.context;
        if (ctx && ctx.status === 404) msg = "The job agent isn't set up yet. Deploy the find-jobs function in Supabase.";
        else if (ctx && typeof ctx.json === "function") { try { const b = await ctx.json(); if (b && b.error) msg = b.error; } catch { /* keep default */ } }
        status.textContent = msg;
        return;
      }
      agentJobs = (data && Array.isArray(data.jobs) ? data.jobs : []).map(j => ({ ...j, ...scoreJob(j) }))
        .sort((a, b) => b.score - a.score || (b.posted || "").localeCompare(a.posted || ""));
      agentShown = 24;
      agentSearched = true;
      agentSponsorList = !!data.sponsorList;
      const strong = agentJobs.filter(j => j.score >= 70).length;
      const sponsorCount = agentJobs.filter(canSponsor).length;
      const c = data.counts || {};
      const split = [c.Reed ? `${c.Reed} from Reed` : "", c.Adzuna ? `${c.Adzuna} from Adzuna` : ""].filter(Boolean).join(", ");
      status.textContent = `Found ${agentJobs.length} jobs${split ? " (" + split + ")" : ""}, ${strong} strong ${strong === 1 ? "match" : "matches"}, ${sponsorCount} can sponsor.` + (data.problems && data.problems.length ? " " + data.problems[0] : "");
      renderAgentResults();
    } catch (err) {
      console.error(err);
      status.textContent = "Something went wrong. Try again.";
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- sponsor list (owner only) ----------
  // Loads the UK register of licensed sponsors (a CSV from GOV.UK) into the sponsors table,
  // so the job agent can label employers that can sponsor workers.
  // Simplified organisation name. Must match normOrg() in the find-jobs function.
  function normOrg(s) {
    return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(?:the|ltd|limited|plc|llp|llc|inc|uk|co|company|group|holdings)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  async function loadSponsorInfo() {
    const st = $("#sponsorStatus");
    if (!st || userRole !== "owner") return;
    const head = await sb.from("sponsors").select("norm", { count: "exact", head: true });
    if (head.error) { st.textContent = "Not set up yet. Run supabase/sponsors.sql in Supabase first."; return; }
    if (!head.count) { st.textContent = "No sponsor list loaded yet."; return; }
    const last = await sb.from("sponsors").select("batch").order("batch", { ascending: false }).limit(1);
    const d = last.data && last.data[0] ? new Date(last.data[0].batch) : null;
    st.textContent = `${head.count.toLocaleString("en-GB")} organisations loaded` + (d && !isNaN(d) ? `, updated ${fmt(d)} ${d.getFullYear()}` : "") + ".";
  }
  async function importSponsors(file) {
    const st = $("#sponsorStatus"), btn = $("#sponsorBtn");
    btn.disabled = true;
    try {
      st.textContent = "Reading the file…";
      const rows = parseCsv((await file.text()).replace(/^﻿/, ""));
      if (rows.length < 2) throw new Error("That file is empty.");
      let col = rows[0].findIndex(c => /organi[sz]ation\s*name/i.test(c));
      if (col < 0) col = 0;
      const names = new Map();
      for (const r of rows.slice(1)) {
        const raw = (r[col] || "").trim();
        if (!raw) continue;
        for (const n of [raw, ...raw.split(/\s+(?:t\/a|trading as)\s+/i)]) {
          const norm = normOrg(n);
          if (norm.length >= 3 && !names.has(norm)) names.set(norm, n.slice(0, 200));
        }
      }
      if (names.size < 1000) throw new Error("This doesn't look like the sponsor register. Download the Worker and Temporary Worker CSV from GOV.UK.");
      const batch = new Date().toISOString();
      const all = [...names].map(([norm, name]) => ({ norm, name, batch }));
      const SIZE = 1000;
      let done = 0;
      for (let i = 0; i < all.length; i += SIZE * 4) {
        const group = [];
        for (let k = i; k < Math.min(all.length, i + SIZE * 4); k += SIZE) group.push(all.slice(k, k + SIZE));
        const res = await Promise.all(group.map(chunk => sb.from("sponsors").upsert(chunk, { onConflict: "norm" })));
        const bad = res.find(r => r.error);
        if (bad) throw new Error(/relation|schema cache|does not exist/i.test(bad.error.message) ? "Run supabase/sponsors.sql in Supabase first." : bad.error.message);
        done += group.reduce((n, c) => n + c.length, 0);
        st.textContent = `Uploading ${done.toLocaleString("en-GB")} of ${all.length.toLocaleString("en-GB")}…`;
      }
      st.textContent = "Removing old entries…";
      const del = await sb.from("sponsors").delete().neq("batch", batch);
      if (del.error) throw new Error(del.error.message);
      toast("Sponsor list updated");
      await loadSponsorInfo();
    } catch (err) {
      console.error(err);
      st.textContent = err && err.message ? err.message : "That didn't work. Try again.";
    } finally {
      btn.disabled = false;
      $("#sponsorFile").value = "";
    }
  }

  // ---------- private board (owner only) ----------
  // A separate page only the owner can open. Its title, steps and checklist live in the
  // private_board table, which the database lets only the owner read, so nothing about it
  // is written in this public code.
  const PV_STATUSES = [["todo", "Not started"], ["doing", "In progress"], ["waiting", "Waiting"], ["done", "Done"]];
  let pvData = null, pvTimer = 0, pvDirty = false;
  const pvBlank = () => ({ title: "Private board", link: "", steps: [], checklist: [], notes: "" });
  const safeLink = u => /^https:\/\/\S+$/i.test(String(u || "").trim()) ? String(u).trim() : "";
  function pvStatus(text) { $("#pvSaved").textContent = text; }
  function pvChanged(rerender) {
    pvDirty = true;
    pvStatus("Saving soon…");
    clearTimeout(pvTimer);
    pvTimer = setTimeout(pvSave, 700);
    if (rerender) renderPrivate(); else renderPvProgress();
  }
  async function pvSave() {
    clearTimeout(pvTimer);
    if (!pvData || !session || userRole !== "owner") return;
    pvStatus("Saving…");
    const { error } = await sb.from("private_board").upsert({ user_id: session.user.id, data: pvData, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) { console.error(error); pvStatus("Not saved. Check your connection."); return; }
    pvDirty = false;
    pvStatus("Saved");
  }
  async function openPrivate() {
    if (userRole !== "owner") return;
    showView("privateView");
    window.scrollTo(0, 0);
    if (pvData) { renderPrivate(); return; }
    $("#pvBody").hidden = true;
    $("#pvSetup").hidden = true;
    pvStatus("Loading…");
    const { data, error } = await sb.from("private_board").select("data").maybeSingle();
    if (error) {
      console.error(error);
      pvStatus("");
      $("#pvSetup").hidden = false;
      $("#pvSetupMsg").textContent = /relation|schema cache|does not exist/i.test(error.message) ? "This page isn't set up yet. Run your private setup file in Supabase first." : "Couldn't load this page. Check your connection and try again.";
      return;
    }
    pvData = Object.assign(pvBlank(), data && data.data ? data.data : {});
    if (!Array.isArray(pvData.steps)) pvData.steps = [];
    if (!Array.isArray(pvData.checklist)) pvData.checklist = [];
    pvStatus(data ? "Saved" : "");
    $("#pvBody").hidden = false;
    renderPrivate();
  }
  async function closePrivate() {
    if (pvDirty) await pvSave();
    showView("appView");
  }
  function renderPvProgress() {
    if (!pvData) return;
    const sd = pvData.steps.filter(x => x.status === "done").length;
    const cd = pvData.checklist.filter(x => x.done).length;
    const next = pvData.steps.filter(x => x.status !== "done" && parseD(x.date) && parseD(x.date) >= today())
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    $("#pvStepsDone").textContent = `${sd} of ${pvData.steps.length}`;
    $("#pvChecksDone").textContent = `${cd} of ${pvData.checklist.length}`;
    $("#pvNext").textContent = next ? `${fmt(parseD(next.date))}: ${next.name || "Untitled step"}` : "No date set";
    const pct = pvData.steps.length ? Math.round(sd / pvData.steps.length * 100) : 0;
    $("#pvBar").style.width = Math.max(2, pct) + "%";
    const link = safeLink(pvData.link);
    const open = $("#pvOpen");
    open.hidden = !link;
    if (link) open.href = link;
  }
  function pvButton(label, text, onClick, cls) {
    const b = h("button", { class: "btn small" + (cls ? " " + cls : ""), type: "button", "aria-label": label, title: label }, text);
    b.addEventListener("click", onClick);
    return b;
  }
  function moveItem(list, i, d) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    pvChanged(true);
  }
  function renderPrivate() {
    if (!pvData) return;
    $("#pvTitle").value = pvData.title || "";
    $("#pvLink").value = pvData.link || "";
    $("#pvNotes").value = pvData.notes || "";
    const steps = $("#pvSteps");
    steps.replaceChildren();
    if (!pvData.steps.length) steps.append(h("li", { class: "empty" }, "No steps yet. Add your first one."));
    pvData.steps.forEach((st, i) => {
      const status = h("select", { class: "field", "aria-label": "Status" }, PV_STATUSES.map(([v, l]) => h("option", { value: v }, l)));
      status.value = PV_STATUSES.some(([v]) => v === st.status) ? st.status : "todo";
      status.addEventListener("change", () => { st.status = status.value; pvChanged(true); });
      const name = h("input", { class: "field pv-name", "aria-label": "Step", placeholder: "Step", value: st.name || "" });
      name.addEventListener("input", () => { st.name = name.value; pvChanged(false); });
      const date = h("input", { class: "field", type: "date", "aria-label": "Date", value: st.date || "" });
      date.addEventListener("change", () => { st.date = date.value; pvChanged(false); });
      const note = h("input", { class: "field pv-note", "aria-label": "Note", placeholder: "Note", value: st.note || "" });
      note.addEventListener("input", () => { st.note = note.value; pvChanged(false); });
      steps.append(h("li", { class: "pv-step pv-" + status.value },
        h("span", { class: "pv-num" }, String(i + 1)),
        status, name, date, note,
        h("span", { class: "pv-acts" },
          pvButton("Move up", "↑", () => moveItem(pvData.steps, i, -1)),
          pvButton("Move down", "↓", () => moveItem(pvData.steps, i, 1)),
          pvButton("Delete step", "✕", () => { pvData.steps.splice(i, 1); pvChanged(true); }, "danger"))));
    });
    const checks = $("#pvChecks");
    checks.replaceChildren();
    if (!pvData.checklist.length) checks.append(h("li", { class: "empty" }, "Nothing on the checklist yet."));
    pvData.checklist.forEach((it, i) => {
      const box = h("input", { type: "checkbox", "aria-label": "Ready" });
      box.checked = !!it.done;
      box.addEventListener("change", () => { it.done = box.checked; pvChanged(true); });
      const text = h("input", { class: "field pv-name", "aria-label": "Item", placeholder: "Item", value: it.text || "" });
      text.addEventListener("input", () => { it.text = text.value; pvChanged(false); });
      const link = h("input", { class: "field pv-note", "aria-label": "Link (optional)", placeholder: "Link to the file (optional)", value: it.link || "" });
      link.addEventListener("change", () => { it.link = link.value.trim(); pvChanged(true); });
      const url = safeLink(it.link);
      checks.append(h("li", { class: "pv-check" + (it.done ? " done" : "") },
        box, text, link,
        h("span", { class: "pv-acts" },
          url ? h("a", { class: "btn small", href: url, target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Open") : null,
          pvButton("Delete item", "✕", () => { pvData.checklist.splice(i, 1); pvChanged(true); }, "danger"))));
    });
    renderPvProgress();
  }

  // ---------- import, export and summary ----------
  function exportBackup() {
    const strip = ({ id, createdAt, updatedAt, ...rest }) => rest;
    const data = { app: "job-hunt-tracker", version: 1, exportedAt: new Date().toISOString(), settings, applications: apps.map(strip) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: `job-hunt-backup-${iso(today())}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Backup downloaded");
  }
  async function importFile(file) {
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { toast("That file isn't a valid backup."); return; }
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.applications) ? parsed.applications : null;
    if (!list) { toast("No applications found in that file."); return; }
    const seen = new Set(apps.map(a => (a.company + "|" + a.role).toLowerCase()));
    const rows = [];
    let skipped = 0;
    for (const item of list) {
      if (!item || typeof item !== "object" || !item.company || !item.role) { skipped++; continue; }
      const k = (item.company + "|" + item.role).toLowerCase();
      if (seen.has(k)) { skipped++; continue; }
      seen.add(k);
      rows.push({ ...toRow(item), user_id: session.user.id });
    }
    try {
      if (rows.length) {
        const { data, error } = await sb.from("applications").insert(rows).select();
        if (error) throw error;
        apps = [...apps, ...data.map(fromRow)];
      }
      if (parsed.settings && Number.isFinite(+parsed.settings.weeklyTarget)) {
        settings = { weeklyTarget: Math.max(1, Math.min(30, Math.round(+parsed.settings.weeklyTarget))), checks: { ...(parsed.settings.checks || {}), ...settings.checks } };
        saveSettings();
      }
      renderAll();
      toast(`Imported ${rows.length}` + (skipped ? `, skipped ${skipped} already here or incomplete` : ""));
    } catch (err) {
      console.error(err);
      toast("The import didn't finish. Nothing was added. Try again.");
    }
  }
  function buildSummary() {
    const sent = apps.filter(a => furthest(a) >= 1);
    const lines = [
      `Job search summary (${fmt(today())} ${today().getFullYear()})`,
      `Goal: a job offer by ${fmt(GOAL)} ${GOAL.getFullYear()}`,
      `Sent: ${sent.length} · Heard back: ${sent.filter(heardBack).length} · Interviews: ${sent.filter(a => furthest(a) >= 3).length} · Offers: ${sent.filter(a => furthest(a) >= 5).length}`,
      "",
      "Applications:"
    ];
    for (const a of [...apps].sort((x, y) => (y.dateApplied || "").localeCompare(x.dateApplied || ""))) {
      lines.push(`- ${a.role} at ${a.company} (${trackName(a.track)}): ${statusOf(a.status).label}, furthest stage ${STAGES[furthest(a)]}` +
        (a.dateApplied ? `, applied ${a.dateApplied}` : "") + (a.feedback ? `. Feedback: ${a.feedback.replace(/\s+/g, " ")}` : ""));
    }
    return lines.join("\n");
  }
  async function copySummary() {
    const text = buildSummary();
    try { await navigator.clipboard.writeText(text); toast("Summary copied"); }
    catch {
      const ta = h("textarea", { class: "field" }); ta.value = text;
      document.body.append(ta); ta.select();
      const ok = document.execCommand && document.execCommand("copy");
      ta.remove();
      toast(ok ? "Summary copied" : "Couldn't copy. Your browser blocked it.");
    }
  }

  // ---------- sign-in ----------
  function showView(name) {
    for (const v of ["setupView", "signinView", "recoverView", "pendingView", "appView", "privateView"]) $("#" + v).hidden = v !== name;
  }
  function setMsg(el, text, kind) { el.textContent = text; el.className = "msg" + (kind ? " " + kind : ""); el.hidden = !text; }
  async function signIn(e) {
    e.preventDefault();
    const email = $("#si-email").value.trim(), password = $("#si-password").value;
    const msg = $("#si-msg");
    if (!email || !password) { setMsg(msg, "Enter your email and password.", "err"); return; }
    if (signupMode && password.length < 8) { setMsg(msg, "Use a password of at least 8 characters.", "err"); return; }
    $("#si-submit").disabled = true;
    setMsg(msg, signupMode ? "Creating your account…" : "Signing in…");
    if (signupMode) {
      const { data, error } = await sb.auth.signUp({ email, password });
      $("#si-submit").disabled = false;
      if (error) setMsg(msg, /not allowed|disabled/i.test(error.message) ? "New accounts are switched off right now. Ask the owner to turn them on." : error.message, "err");
      else if (!data.session) setMsg(msg, "Your account needs email confirmation, which this site doesn't use. Ask the owner to turn off Confirm email in Supabase.", "err");
      else setMsg(msg, "");
      return;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $("#si-submit").disabled = false;
    if (error) setMsg(msg, error.message === "Invalid login credentials" ? "That email and password don't match." : error.message, "err");
    else setMsg(msg, "");
  }
  function toggleSignup() {
    signupMode = !signupMode;
    $("#si-eyebrow").textContent = signupMode ? "Create a view-only account" : "Application tracker";
    $("#si-submit").textContent = signupMode ? "Create account" : "Sign in";
    $("#si-password").setAttribute("autocomplete", signupMode ? "new-password" : "current-password");
    $("#si-forgot").hidden = signupMode;
    $("#si-mode").textContent = signupMode ? "Already have an account? Sign in" : "New here? Create a view-only account";
    setMsg($("#si-msg"), signupMode ? `View-only accounts can see the tracker once ${C.ownerName || "the owner"} approves them.` : "");
  }
  async function forgotPassword() {
    const email = $("#si-email").value.trim();
    const msg = $("#si-msg");
    if (!email) { setMsg(msg, "Type your email above first, then tap Forgot your password again.", "err"); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    setMsg(msg, error ? error.message : "If that email has an account, a reset link is on its way.", error ? "err" : "ok");
  }
  async function setNewPassword(e) {
    e.preventDefault();
    const password = $("#rc-password").value;
    const msg = $("#rc-msg");
    if (password.length < 8) { setMsg(msg, "Use at least 8 characters.", "err"); return; }
    const { error } = await sb.auth.updateUser({ password });
    if (error) { setMsg(msg, error.message, "err"); return; }
    setMsg(msg, "");
    recovering = false;
    toast("Password updated");
    entered = true;
    enterApp();
  }
  async function signOut() {
    await sb.auth.signOut({ scope: "local" });   // this device only
    toast("Signed out");
  }

  // ---------- roles: owner, viewer, pending ----------
  // The database rules (supabase/viewers.sql) do the real protection; this only decides what the screen shows.
  async function resolveRole() {
    const uid = session.user.id;
    const own = await sb.from("app_owner").select("user_id").maybeSingle();
    if (own.error) {
      // viewers.sql not run yet: behave like the original single-user tracker.
      console.warn("View-only access not set up yet", own.error.message);
      return "owner";
    }
    if (!own.data || own.data.user_id === uid) return "owner";
    const mine = await sb.from("viewers").select("approved").eq("user_id", uid).maybeSingle();
    if (mine.error) throw mine.error;
    if (mine.data && mine.data.approved) return "viewer";
    if (!mine.data) await sb.from("viewers").insert({ email: session.user.email });   // ask the owner for access
    return "pending";
  }
  async function enterApp() {
    try { userRole = await resolveRole(); }
    catch (err) { console.error(err); userRole = "pending"; }
    document.body.classList.toggle("ro", userRole !== "owner");
    if (userRole === "pending") {
      $("#pd-email").textContent = session.user.email;
      showView("pendingView");
      return;
    }
    $("#privateBtn").hidden = userRole !== "owner";
    showView("appView");
    renderAll();
    loadData();
    if (userRole === "owner") loadSponsorInfo();
  }
  async function loadViewers() {
    const { data, error } = await sb.from("viewers").select("*").order("created_at", { ascending: false });
    viewers = error ? null : data;
    renderViewers();
  }
  function renderViewers() {
    const tb = $("#viewerRows");
    tb.replaceChildren();
    if (viewers === null) { tb.append(h("tr", null, h("td", { colspan: 4, class: "empty" }, "View-only access isn't switched on yet. Run supabase/viewers.sql in Supabase first."))); return; }
    if (!viewers.length) { tb.append(h("tr", null, h("td", { colspan: 4, class: "empty" }, "No requests yet. Send friends your site link and ask them to tap Create a view-only account."))); return; }
    for (const v of viewers) {
      const asked = new Date(v.created_at);
      const remove = h("button", { class: "btn small danger", type: "button" }, "Remove");
      remove.addEventListener("click", async () => {
        if (!remove.classList.contains("armed")) { remove.classList.add("armed"); remove.textContent = "Tap again"; return; }
        const { error } = await sb.from("viewers").delete().eq("user_id", v.user_id);
        toast(error ? "That didn't work. Try again." : `${v.email} removed`);
        loadViewers();
      });
      const approve = v.approved ? null : h("button", { class: "btn small primary", type: "button" }, "Approve");
      if (approve) approve.addEventListener("click", async () => {
        approve.disabled = true;
        const { error } = await sb.from("viewers").update({ approved: true }).eq("user_id", v.user_id);
        toast(error ? "That didn't work. Try again." : `${v.email} can now view your tracker`);
        loadViewers();
      });
      tb.append(h("tr", null,
        h("td", null, v.email),
        h("td", { class: "date" }, isNaN(asked) ? "—" : fmt(asked)),
        h("td", null, h("span", { class: "chip " + (v.approved ? "s-accepted" : "k-check nodot") }, v.approved ? "Can view" : "Waiting")),
        h("td", null, h("div", { class: "data-actions" }, approve, remove))));
    }
  }
  async function changePassword() {
    const input = $("#newPassword");
    const password = input.value;
    if (password.length < 8) { toast("Use at least 8 characters."); input.focus(); return; }
    const btn = $("#changePw");
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password });
    if (error) { btn.disabled = false; toast(error.message); return; }
    input.value = "";
    const out = await sb.auth.signOut({ scope: "others" });   // sign out every other device
    btn.disabled = false;
    toast(out.error ? "Password changed." : "Password changed. Every other device is now signed out.");
  }

  // ---------- start-up ----------
  function wire() {
    fillSelect($("#f-track"), TRACKS.map(t => [t.id, t.name]));
    fillSelect($("#f-status"), STATUSES.map(s => [s.id, s.label]));
    fillSelect($("#f-furthest"), STAGES.map((s, i) => [String(i), s]));
    fillSelect($("#f-cv"), CVS.map(c => [c, c || "Not set"]));
    $("#fTrack").append(...TRACKS.map(t => h("option", { value: t.id }, t.name)));
    $("#f-status").addEventListener("change", () => {
      const stg = statusOf($("#f-status").value).stage;
      if (stg !== null && stg > +$("#f-furthest").value) $("#f-furthest").value = String(stg);
      if (stg !== null && stg >= 1 && !$("#f-applied").value) $("#f-applied").value = iso(today());
    });
    ["q", "fStatus", "fTrack", "fSort"].forEach(id => $("#" + id).addEventListener(id === "q" ? "input" : "change", renderTable));
    $("#addTop").addEventListener("click", () => openEditor(null));
    $("#addMain").addEventListener("click", () => openEditor(null));
    $("#edClose").addEventListener("click", closeEditor);
    $("#edCancel").addEventListener("click", closeEditor);
    $("#edSave").addEventListener("click", saveEditor);
    $("#edDelete").addEventListener("click", deleteEditing);
    $("#edForm").addEventListener("submit", e => { e.preventDefault(); saveEditor(); });
    $("#editor").addEventListener("click", e => { if (e.target.id === "editor") closeEditor(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#editor").hidden) closeEditor(); });
    $("#copySummary").addEventListener("click", copySummary);
    $("#exportBtn").addEventListener("click", exportBackup);
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importFile(f); });
    $("#signOut").addEventListener("click", signOut);
    $("#signinForm").addEventListener("submit", signIn);
    $("#si-forgot").addEventListener("click", forgotPassword);
    $("#recoverForm").addEventListener("submit", setNewPassword);
    $("#si-mode").addEventListener("click", toggleSignup);
    $("#pd-check").addEventListener("click", () => { $("#pd-check").disabled = true; enterApp().finally(() => { $("#pd-check").disabled = false; }); });
    $("#pd-signout").addEventListener("click", signOut);
    $("#viewersRefresh").addEventListener("click", loadViewers);
    $("#changePw").addEventListener("click", changePassword);
    const savedForm = readStore("jobAgentForm", null);
    $("#ag-terms").value = savedForm && savedForm.terms ? savedForm.terms : AGENT.terms.join("\n");
    $("#ag-location").value = savedForm && savedForm.location != null ? savedForm.location : AGENT.location;
    $("#ag-miles").value = String(savedForm && savedForm.miles != null ? savedForm.miles : AGENT.miles);
    $("#agentForm").addEventListener("submit", runAgent);
    $("#ag-sponsor").value = readStore("jobAgentSponsor", "all");
    if (!$("#ag-sponsor").value) $("#ag-sponsor").value = "all";
    $("#ag-sponsor").addEventListener("change", () => { writeStore("jobAgentSponsor", $("#ag-sponsor").value); agentShown = 24; renderAgentResults(); });
    $("#sponsorBtn").addEventListener("click", () => $("#sponsorFile").click());
    $("#sponsorFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) importSponsors(f); });
    // Private board
    $("#privateBtn").addEventListener("click", openPrivate);
    $("#pvBack").addEventListener("click", closePrivate);
    $("#pvRetry").addEventListener("click", () => { pvData = null; openPrivate(); });
    $("#pvTitle").addEventListener("input", () => { if (pvData) { pvData.title = $("#pvTitle").value; pvChanged(false); } });
    $("#pvLink").addEventListener("change", () => { if (pvData) { pvData.link = $("#pvLink").value.trim(); pvChanged(false); } });
    $("#pvNotes").addEventListener("input", () => { if (pvData) { pvData.notes = $("#pvNotes").value; pvChanged(false); } });
    $("#pvAddStep").addEventListener("click", () => {
      if (!pvData) return;
      pvData.steps.push({ name: "", status: "todo", date: "", note: "" });
      pvChanged(true);
      const names = document.querySelectorAll("#pvSteps .pv-name");
      if (names.length) names[names.length - 1].focus();
    });
    $("#pvAddCheck").addEventListener("click", () => {
      if (!pvData) return;
      pvData.checklist.push({ text: "", done: false, link: "" });
      pvChanged(true);
      const names = document.querySelectorAll("#pvChecks .pv-name");
      if (names.length) names[names.length - 1].focus();
    });
    window.addEventListener("pagehide", () => { if (pvDirty) pvSave(); });
    renderAgentResults();
    let tgtTimer;
    $("#target").addEventListener("input", () => {
      const n = Math.round(+$("#target").value);
      if (!Number.isFinite(n) || n < 1 || n > 30) return;
      settings.weeklyTarget = n;
      renderCountdown(); renderKpis(); renderWeekChart();
      clearTimeout(tgtTimer); tgtTimer = setTimeout(saveSettings, 700);
    });
    let rsTimer;
    if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(rsTimer); rsTimer = setTimeout(renderWeekChart, 80); }).observe($("#weekChart"));
    // Pick up changes made on another device when you come back to this tab.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && session && (userRole === "owner" || userRole === "viewer") && Date.now() - lastLoad > 30000) loadData();
    });
  }

  function start() {
    renderHeader();
    const configured = /^https:\/\/.+/.test(CFG.supabaseUrl || "") && CFG.supabaseKey && !/PASTE_/.test(CFG.supabaseKey);
    if (!configured || !window.supabase) { showView("setupView"); return; }
    wire();
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey);
    sb.auth.onAuthStateChange((event, s) => {
      session = s;
      if (event === "PASSWORD_RECOVERY") { recovering = true; showView("recoverView"); return; }
      if (!s) { recovering = false; entered = false; userRole = null; apps = []; loaded = false; pvData = null; pvDirty = false; $("#privateBtn").hidden = true; document.body.classList.remove("ro"); showView("signinView"); return; }
      if (recovering) return;
      // Route outside the auth callback, as Supabase recommends.
      if (!entered && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) { entered = true; setTimeout(enterApp, 0); }
      else if (userRole && userRole !== "pending") renderAll();
    });
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(err => console.warn("Offline mode unavailable", err)));
  }
  // ---------- light / dark switch ----------
  // Remembers your choice on this device. With nothing saved, the app follows the device setting.
  const themeBtn = document.getElementById("themeBtn");
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  function savedTheme() { try { return localStorage.getItem("theme"); } catch { return null; } }
  function isDark() { const t = document.documentElement.dataset.theme; return t ? t === "dark" : systemDark.matches; }
  function applyTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    if (themeBtn) themeBtn.textContent = isDark() ? "\u2600\uFE0E Light mode" : "\u263E Dark mode";
  }
  if (themeBtn) themeBtn.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    try { localStorage.setItem("theme", next); } catch { /* private browsing: works until reload */ }
    applyTheme(next);
  });
  systemDark.addEventListener("change", () => applyTheme(savedTheme()));
  applyTheme(savedTheme());

  start();
})();
