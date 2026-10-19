/* Morning Edition, public copy: contents sheet, source cards, reading progress, and the
   installable/offline part (service worker sw.js keeps every issue on the device).
   No saves, votes or API calls: this file ships to the public site. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  let lastFocus = null;
  function openSheet(build, label) {
    const sheet = $("#sheet"), body = $("#sheet-body");
    if (!sheet) return;
    body.replaceChildren();
    build(body);
    $("#sheet-label").textContent = label || "Details";
    lastFocus = document.activeElement;
    sheet.hidden = false;
    document.documentElement.style.overflow = "hidden";
    $(".sheet-panel", sheet).focus({ preventScroll: true });
  }
  function closeSheet() {
    const sheet = $("#sheet");
    if (!sheet || sheet.hidden) return;
    sheet.hidden = true;
    document.documentElement.style.overflow = "";
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  function sourceCard(li) {
    const main = Array.from(li.children).find((n) => n.tagName === "A");
    const via = $(".src-via", li);
    const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; } };
    const viaText = via ? via.textContent.replace(/\s+/g, " ").trim() : "";
    const sender = viaText.split(" · ")[0];
    const card = document.createElement(main ? "a" : "div");
    card.className = "src-card";
    if (main) { card.href = main.href; card.target = "_blank"; card.rel = "noopener noreferrer"; }
    const pub = document.createElement("div");
    pub.className = "src-pub";
    const name = (main && host(main.href)) || sender || "Source";
    const init = document.createElement("span");
    init.className = "src-init"; init.textContent = name.charAt(0);
    pub.append(init, document.createTextNode(name));
    const title = document.createElement("div");
    title.className = "src-title";
    title.textContent = (main ? main.textContent : li.textContent.replace(/^\[#\d+\]\s*/, "")).trim() || name;
    card.append(pub, title);
    const out = [card];
    if (sender) {
      const v = document.createElement("div");
      v.className = "src-via";
      const parts = viaText.split(" · ");
      v.textContent = "In " + parts[0] + (parts.length > 2 ? ", " + parts[parts.length - 1] : "");
      out.push(v);
    }
    return out;
  }

  function showCite(a) {
    const ids = (a.dataset.srcs || a.getAttribute("href").slice(1)).split(/\s+/).filter(Boolean);
    const para = a.closest("p, li, blockquote");
    openSheet((body) => {
      const h = document.createElement("h2");
      h.className = "sheet-title";
      h.textContent = ids.length > 1 ? `${ids.length} sources` : "Source";
      body.append(h);
      if (para) {
        const clone = para.cloneNode(true);
        $$("a.cite", clone).forEach((c) => c.remove());
        const t = clone.textContent.replace(/\s+/g, " ").trim();
        const q = document.createElement("p");
        q.className = "sheet-quote";
        q.textContent = t.length > 160 ? t.slice(0, 157).replace(/\s+\S*$/, "") + "…" : t;
        body.append(q);
      }
      for (const id of ids) {
        const li = document.getElementById(id);
        if (li) body.append(...sourceCard(li));
      }
    }, ids.length > 1 ? "Sources" : "Source");
  }

  // ---- offline: keep every issue on the device, stay on the newest version -------------
  const KEY = (k) => "me-pub-" + k;
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    return h < 24 ? h + " h ago" : Math.round(h / 24) + " d ago";
  }
  async function syncLine() {
    const line = $("#sync-line"), rows = $$(".issue-row[data-date]");
    if (!line || !rows.length || !("caches" in window)) return;
    let n = 0;
    for (const r of rows) if (await caches.has("me-pub-issue-" + r.dataset.date)) n++;
    let when = "";
    try { const t = Number(localStorage.getItem(KEY("synced")) || 0); if (t) when = " Checked " + ago(t) + "."; } catch (_) {}
    line.textContent = n >= rows.length
      ? (rows.length === 1 ? "This issue is" : `All ${rows.length} issues are`) + " saved on this device and read offline." + when
      : `${n} of ${rows.length} issues saved on this device; the rest download in the background.`;
    line.hidden = false;
    if (installEvt && !$(".install-btn", line)) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "install-btn"; b.textContent = "Install the app";
      b.addEventListener("click", async () => { installEvt.prompt(); installEvt = null; b.remove(); });
      line.append(" ", b);
    }
  }
  let installEvt = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; syncLine(); });

  function initOffline() {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker, root = document.body.dataset.root || "./";
    const hadController = !!sw.controller;
    let reg = null, lastCheck = 0, reloading = false;
    function reloadNow() {
      if (reloading) return;
      reloading = true;
      try { sessionStorage.setItem(KEY("scroll"), JSON.stringify({ p: location.pathname, y: scrollY })); } catch (_) {}
      location.reload();
    }
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY("scroll")) || "null");
      sessionStorage.removeItem(KEY("scroll"));
      if (s && s.p === location.pathname) requestAnimationFrame(() => scrollTo(0, s.y));
    } catch (_) {}
    sw.addEventListener("controllerchange", () => {
      if (!hadController) return;
      if (document.hidden || $("#sheet")?.hidden !== false) reloadNow();
      else document.addEventListener("visibilitychange", () => { if (document.hidden) reloadNow(); }, { once: true });
    });
    sw.addEventListener("message", (e) => {
      if (!e.data || e.data.type !== "issues-synced") return;
      try { localStorage.setItem(KEY("synced"), String(Date.now())); } catch (_) {}
      const rows = $$(".issue-row[data-date]");
      if (rows.length && e.data.latest && !rows.some((r) => r.dataset.date === e.data.latest)) {
        let seen = null;
        try { seen = sessionStorage.getItem(KEY("latest")); sessionStorage.setItem(KEY("latest"), e.data.latest); } catch (_) {}
        if (seen !== e.data.latest) { reloadNow(); return; }
      }
      syncLine();
    });
    function check(force) {
      if (!reg || navigator.onLine === false) return;
      if (!force && Date.now() - lastCheck < 120000) return;
      lastCheck = Date.now();
      reg.update().catch(() => {});
      (reg.active || sw.controller)?.postMessage({ type: "sync-issues" });
    }
    sw.register(root + "sw.js", { scope: root }).then(async (r) => {
      reg = r;
      await sw.ready;
      if (navigator.onLine === false) { try { await r.sync?.register("me-pub-issues"); } catch (_) {} }
      else check(true);
      try {
        if (r.periodicSync) {
          const st = await navigator.permissions.query({ name: "periodic-background-sync" });
          if (st.state === "granted") await r.periodicSync.register("me-pub-issues", { minInterval: 6 * 3600 * 1000 });
        }
      } catch (_) {}
    }).catch(() => {});
    addEventListener("online", () => check(true));
    addEventListener("offline", () => { try { reg?.sync?.register("me-pub-issues"); } catch (_) {} });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(false); });
    syncLine();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initOffline();
    const art = $("#issue");
    $$("#sheet [data-close]").forEach((el) => el.addEventListener("click", closeSheet));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
    if (!art) return;
    art.addEventListener("click", (e) => {
      const cite = e.target.closest("a.cite");
      if (cite) { e.preventDefault(); showCite(cite); }
    });

    let current = null;
    $("#toc-btn")?.addEventListener("click", () => {
      openSheet((body) => {
        body.append($("#toc-tpl").content.cloneNode(true));
        if (current) $$(`a[data-target="${current}"]`, body).forEach((x) => x.classList.add("on"));
        $$("a", body).forEach((a) => a.addEventListener("click", () => closeSheet()));
      }, "Contents");
    });

    const barTitle = $("#bar-title"), dateHtml = barTitle ? barTitle.innerHTML : "";
    const heads = $$("section > h2[id], #sources > h2", art);
    function track() {
      let on = null;
      for (const h of heads) { if (h.getBoundingClientRect().top <= 100) on = h; else break; }
      const id = on ? (on.id || on.closest("section")?.id || null) : null;
      if (id === current) return;
      current = id;
      if (barTitle) { if (on) barTitle.textContent = on.textContent.trim(); else barTitle.innerHTML = dateHtml; }
      $$(".rail-toc a").forEach((a) => a.classList.toggle("on", a.dataset.target === id));
    }
    const fill = $("#progress-fill"), bar = $("#bar");
    let lastY = scrollY, ticking = false;
    function onScroll() {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (fill) fill.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      const dy = scrollY - lastY;
      if (bar && Math.abs(dy) > 6) {
        bar.classList.toggle("tucked", dy > 0 && scrollY > 200 && $("#sheet").hidden);
        lastY = scrollY;
      }
      track();
    }
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
    onScroll();
  });
})();
