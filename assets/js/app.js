(() => {
  "use strict";

  const CFG = window.SITE_CONFIG;
  const API = "https://api.github.com";

  /* ---------------------------------------------------------------- helpers */

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

  function timeAgo(iso) {
    if (!iso) return "unknown";
    const secs = (Date.now() - new Date(iso)) / 1000;
    const steps = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
    for (const [size, unit] of steps) {
      if (secs >= size) return Math.floor(secs / size) + unit + " ago";
    }
    return "just now";
  }

  /* ----------------------------------------------------------------- router */

  const content = $("#content");
  const pageCache = new Map();

  function routeToPath(route) {
    // "projects/zboe2" -> "pages/projects/zboe2.html". Traversal is stripped.
    const clean = route
      .split("/")
      .filter((seg) => seg && seg !== "." && seg !== "..")
      .map((seg) => seg.replace(/[^\w-]/g, ""))
      .join("/");
    return `${CFG.pagesDir}/${clean || CFG.defaultRoute}.html`;
  }

  function currentRoute() {
    const hash = location.hash.replace(/^#\/?/, "");
    return hash || CFG.defaultRoute;
  }

  function runInlineScripts(root) {
    $$("script", root).forEach((old) => {
      const fresh = document.createElement("script");
      for (const { name, value } of old.attributes) fresh.setAttribute(name, value);
      fresh.textContent = old.textContent;
      old.replaceWith(fresh);
    });
  }

  function navLinkHTML(item, linkClass) {
    const route = item.src.replace(/\.html$/, "");
    return `<a class="${linkClass}" href="#/${esc(route)}">${esc(item.page)}</a>`;
  }

  function renderNav() {
    const mount = $("#navList");
    if (!mount || !CFG.nav) return;
    mount.innerHTML = CFG.nav.map((item) => {
      if (item.dropdown) {
        const links = item.links.map((link) => link.divider
          ? `<li><hr class="dropdown-divider"></li>`
          : `<li>${navLinkHTML(link, "dropdown-item")}</li>`
        ).join("");
        return `<li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
            ${esc(item.dropdown)}
          </a>
          <ul class="dropdown-menu">${links}</ul>
        </li>`;
      }
      return `<li class="nav-item">${navLinkHTML(item, "nav-link")}</li>`;
    }).join("");
  }

  function markActiveLink(route) {
    const target = `#/${route}`;
    $$(".navbar .nav-link, .navbar .dropdown-item").forEach((a) => {
      const isMatch = a.getAttribute("href") === target;
      a.classList.toggle("active", isMatch);
      if (isMatch) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");

      // Light up the parent "Projects" toggle when a child page is open.
      const menu = a.closest(".dropdown-menu");
      if (menu && isMatch) menu.previousElementSibling?.classList.add("active");
    });
    if (!target.startsWith("#/projects")) {
      $$(".navbar .dropdown-toggle").forEach((t) => t.classList.remove("active"));
    }
  }

  async function loadRoute() {
    const route = currentRoute();
    const path = routeToPath(route);
    markActiveLink(route);
    content.classList.add("is-swapping");

    try {
      if (!pageCache.has(path)) {
        const res = await fetch(path, { headers: { Accept: "text/html" } });
        if (!res.ok) throw new Error(res.status);
        pageCache.set(path, await res.text());
      }
      content.innerHTML = pageCache.get(path);
      runInlineScripts(content);
      document.title = ($("h1", content)?.textContent.trim() || CFG.siteName) + " · " + CFG.siteName;
    } catch (err) {
      content.innerHTML = `
        <h1 class="page-title">Page not found</h1>
        <p class="lead">Nothing is filed under <code>${esc(route)}</code>.</p>
        <p><a href="#/${esc(CFG.defaultRoute)}">Back to the home page</a></p>`;
      document.title = "Not found · " + CFG.siteName;
    } finally {
      content.classList.remove("is-swapping");
      // Close the mobile menu before scrolling — scrollIntoView(#content) would
      // otherwise measure #content's position while the menu is still open and
      // land short once the menu's collapse shifts everything up afterward.
      const nav = $("#mainNav");
      if (nav?.classList.contains("show")) bootstrap.Collapse.getOrCreateInstance(nav).hide();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  /* ------------------------------------------------------------ github data */

  function cacheGet(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const { at, data } = JSON.parse(raw);
      if (Date.now() - at > CFG.cacheMinutes * 60000) return null;
      return data;
    } catch { return null; }
  }

  function cacheSet(key, data) {
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* full or blocked */ }
  }

  let rateRemaining = null;

  async function gh(endpoint, { force = false } = {}) {
    const key = "gh:" + endpoint;
    if (!force) {
      const hit = cacheGet(key);
      if (hit !== null) return hit;
    }
    const headers = { Accept: "application/vnd.github+json" };
    if (CFG.token) headers.Authorization = "Bearer " + CFG.token;

    const res = await fetch(API + endpoint, { headers });
    rateRemaining = res.headers.get("X-RateLimit-Remaining") ?? rateRemaining;

    if (res.status === 202) return null;             // stats still being generated
    if (res.status === 403 && rateRemaining === "0") throw new Error("rate-limited");
    if (res.status === 404) throw new Error("not-found");
    if (!res.ok) throw new Error("http-" + res.status);

    const data = await res.json();
    cacheSet(key, data);
    return data;
  }

  async function fetchRepo(entry, force) {
    const base = `/repos/${entry.owner}/${entry.repo}`;
    const [meta, commits, branches] = await Promise.all([
      gh(base, { force }),
      gh(`${base}/commits?per_page=${CFG.commitsToShow}`, { force }),
      gh(`${base}/branches?per_page=100`, { force })
    ]);

    let weeks = null;
    if (CFG.showActivityGraph) {
      try {
        const stats = await gh(`${base}/stats/participation`, { force });
        weeks = stats?.all?.slice(-12) ?? null;
      } catch { weeks = null; }
    }
    return { entry, meta, commits: commits || [], branches: branches || [], weeks };
  }

  /* --------------------------------------------------------------- rendering */

  function sparkline(weeks) {
    if (!weeks?.length) return "";
    const max = Math.max(...weeks, 1);
    const bars = weeks.map((n, i) => {
      const h = Math.max(2, Math.round((n / max) * 26));
      return `<rect x="${i * 9}" y="${28 - h}" width="6" height="${h}" rx="1.5"
               class="spark-bar"><title>${n} commit${n === 1 ? "" : "s"}</title></rect>`;
    }).join("");
    return `<div class="repo-section">
      <div class="repo-label">Last 12 weeks</div>
      <svg class="spark" viewBox="0 0 ${weeks.length * 9} 28" role="img"
           aria-label="Commits per week for the last 12 weeks">${bars}</svg>
    </div>`;
  }

  function commitList(commits, repoUrl) {
    if (!commits.length) return `<p class="repo-empty">No commits on the default branch yet.</p>`;
    const [head, ...rest] = commits;
    const line = (c) => {
      const msg = c.commit.message.split("\n")[0];
      const who = c.author?.login || c.commit.author?.name || "unknown";
      return `<li>
        <a href="${esc(c.html_url)}" target="_blank" rel="noopener" class="commit-msg">${esc(msg)}</a>
        <span class="commit-meta">${esc(who)} · ${timeAgo(c.commit.author?.date)}</span>
      </li>`;
    };
    return `
      <div class="repo-section">
        <div class="repo-label">Latest commit</div>
        <ul class="commit-list head">${line(head)}</ul>
      </div>
      ${rest.length ? `<div class="repo-section">
        <div class="repo-label">Before that</div>
        <ul class="commit-list">${rest.map(line).join("")}</ul>
      </div>` : ""}`;
  }

  function branchList(branches, meta) {
    if (!branches.length) return "";
    const def = meta?.default_branch;
    const sorted = [...branches].sort((a, b) => (b.name === def) - (a.name === def));
    const shown = sorted.slice(0, CFG.branchesToShow);
    const extra = sorted.length - shown.length;
    const chips = shown.map((b) => `
      <span class="branch-chip ${b.name === def ? "is-default" : ""}">
        <i class="bi bi-git"></i>${esc(b.name)}${b.protected ? '<i class="bi bi-lock-fill ms-1" title="Protected"></i>' : ""}
      </span>`).join("");
    return `<div class="repo-section">
      <div class="repo-label">Branches <span class="count">${sorted.length}</span></div>
      <div class="branch-wrap">${chips}${extra > 0 ? `<span class="branch-chip muted">+${extra} more</span>` : ""}</div>
    </div>`;
  }

  function repoActionsHTML(entry, meta) {
    const url = meta?.html_url || `https://github.com/${entry.owner}/${entry.repo}`;
    const showIssue = entry.owner === CFG.site_owner;
    return `<div class="repo-actions">
      ${showIssue ? `<a class="repo-action" href="${esc(url)}/issues/new" target="_blank" rel="noopener" title="Report an issue" aria-label="Report an issue"><i class="bi bi-exclamation-circle"></i></a>` : ""}
      <a class="repo-action" href="${esc(url)}" target="_blank" rel="noopener" title="Open in new tab" aria-label="Open in new tab"><i class="bi bi-box-arrow-up-right"></i></a>
    </div>`;
  }

  function cardHTML(state) {
    const { entry, meta } = state;
    const name = entry.label || meta?.name || entry.repo;
    return `
      <article class="card repo-card">
        <div class="card-body">
          <header class="repo-head">
            <div class="repo-head-top">
              <h3 class="repo-name">
                <a href="${esc(meta?.html_url || `https://github.com/${entry.owner}/${entry.repo}`)}"
                   target="_blank" rel="noopener">${esc(name)}</a>
              </h3>
              ${repoActionsHTML(entry, meta)}
            </div>
            <div class="repo-owner">${esc(entry.owner)}/${esc(entry.repo)}</div>
            ${meta?.description ? `<p class="repo-desc">${esc(meta.description)}</p>` : ""}
            <div class="repo-stats">
              ${meta?.language ? `<span><i class="bi bi-circle-fill"></i>${esc(meta.language)}</span>` : ""}
              <span><i class="bi bi-star"></i>${meta?.stargazers_count ?? 0}</span>
              <span><i class="bi bi-diagram-2"></i>${meta?.forks_count ?? 0}</span>
              <span title="Last push"><i class="bi bi-clock-history"></i>${timeAgo(meta?.pushed_at)}</span>
            </div>
            <button type="button" class="repo-toggle" aria-expanded="false">
              Details <i class="bi bi-chevron-down"></i>
            </button>
          </header>
          <div class="repo-collapse collapse">
            ${commitList(state.commits, meta?.html_url)}
            ${sparkline(state.weeks)}
            ${branchList(state.branches, meta)}
          </div>
        </div>
      </article>`;
  }

  function skeletonHTML(entry) {
    return `<article class="card repo-card" data-skeleton>
      <div class="card-body placeholder-glow">
        <h3 class="repo-name">${esc(entry.label || entry.repo)}</h3>
        <span class="placeholder col-8"></span>
        <span class="placeholder col-11"></span>
        <span class="placeholder col-6"></span>
      </div>
    </article>`;
  }

  function errorHTML(entry, err) {
    const msg = {
      "rate-limited": "GitHub's hourly limit is used up. It resets within the hour.",
      "not-found":    "Repo not found, or it's private to this visitor."
    }[err.message] || "Couldn't reach GitHub.";
    return `<article class="card repo-card is-error">
      <div class="card-body">
        <div class="repo-head-top">
          <h3 class="repo-name">${esc(entry.label || entry.repo)}</h3>
          ${repoActionsHTML(entry, null)}
        </div>
        <p class="repo-empty mb-0">${esc(msg)}</p>
      </div>
    </article>`;
  }

  /* ---------------------------------------------------------------- sidebar */

  const mounts = () => [$("#repoCards"), $("#repoCardsMobile")].filter(Boolean);

  function paint(index, html) {
    mounts().forEach((m) => { if (m.children[index]) m.children[index].outerHTML = html; });
  }

  async function loadSidebar(force = false) {
    const repos = CFG.repos || [];
    mounts().forEach((m) => { m.innerHTML = repos.map(skeletonHTML).join(""); });

    await Promise.all(repos.map(async (entry, i) => {
      try {
        paint(i, cardHTML(await fetchRepo(entry, force)));
      } catch (err) {
        paint(i, errorHTML(entry, err));
      }
    }));

    const note = $("#rateNote");
    if (note && rateRemaining !== null) {
      note.textContent = `${rateRemaining} GitHub requests left this hour${CFG.token ? "" : " (unauthenticated)"}.`;
    }
  }

  /* ------------------------------------------------------------------- theme */

  function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.setAttribute("data-bs-theme", saved);
    $("#themeToggle")?.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-bs-theme", next);
      localStorage.setItem("theme", next);
    });
  }

  /* -------------------------------------------------------------------- boot */

  window.addEventListener("hashchange", loadRoute);
  document.addEventListener("click", (e) => {
    if (e.target.closest(".refresh-repos")) loadSidebar(true);

    // Manual toggle wiring (not data-bs-toggle/data-bs-target): #repoCards and
    // #repoCardsMobile are painted with identical HTML, so any ID baked into
    // cardHTML() would collide across the two mounts.
    const toggle = e.target.closest(".repo-toggle");
    if (!toggle) return;
    const panel = toggle.closest(".repo-card")?.querySelector(".repo-collapse");
    if (!panel) return;

    const mount = toggle.closest("#repoCards, #repoCardsMobile");
    const wasOpen = panel.classList.contains("show");

    // Single-open accordion, scoped to this mount only.
    mount?.querySelectorAll(".repo-collapse.show").forEach((other) => {
      if (other === panel) return;
      bootstrap.Collapse.getOrCreateInstance(other).hide();
      other.closest(".repo-card")?.querySelector(".repo-toggle")?.setAttribute("aria-expanded", "false");
    });

    bootstrap.Collapse.getOrCreateInstance(panel).toggle();
    toggle.setAttribute("aria-expanded", String(!wasOpen));
  });

  initTheme();
  renderNav();
  $("#footerYear").textContent = new Date().getFullYear();
  if (!location.hash) location.replace("#/" + CFG.defaultRoute);
  loadRoute();
  loadSidebar();
})();
