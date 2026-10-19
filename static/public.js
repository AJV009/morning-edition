/* Morning Edition, public copy: contents sheet, source cards, reading progress.
   No saves, votes, downloads or API calls: this file ships to the public site. */
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

  document.addEventListener("DOMContentLoaded", () => {
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
