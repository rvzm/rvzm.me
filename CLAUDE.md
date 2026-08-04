# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The static site for `rvzm.me`: a single HTML shell, one vanilla-JS app file, a config file, and a
handful of HTML page fragments. No build step, no framework, no package manager, no tests. Files are
served as-is by nginx.

## Running it locally

There is no dev server or build command. Either open `index.html` directly, or serve the directory
over HTTP (fetches for page fragments require `http(s)://`, not `file://`):

```
python3 -m http.server -d /home/rvzm/web 8000
```

## Deployment

nginx serves this directory (`/home/rvzm/web/`) directly as the document root for `rvzm.me`
(`root /home/rvzm/web/;` in `/etc/nginx/sites-available/rvzm.me.conf`). There is no deploy step —
editing a file here changes the live site immediately.

CSS and JS live under `assets/` (`assets/css/style.css`, `assets/js/app.js`, `assets/js/config.js`),
matching what `index.html` links.

**Watch file permissions after moving/adding files here.** nginx runs as `www-data`, which is not in
the `rvzm` group — every file must be world-readable (`o+r`) and every directory world-traversable
(`o+x`), or nginx will 404 it even though the path is correct. `/home/rvzm` itself also needs `o+x`
for nginx to reach `/home/rvzm/web` at all. New files created with a restrictive umask (e.g. `600`)
will silently break the live site until `chmod o+r` is applied.

**Note when testing locally with curl:** the port-80 server block in
`/etc/nginx/sites-available/rvzm.me.conf` only redirects to HTTPS when the `Host` header is exactly
`rvzm.me` — any other Host (including plain `curl http://localhost/`) hits `return 404;` regardless
of whether the file exists. Test with `curl -k https://localhost/<path> -H "Host: rvzm.me"` instead.

## Architecture

**Client-side hash router, no backend.** `app.js` is a single IIFE with no external JS dependencies
besides Bootstrap 5 (loaded from a CDN in `index.html`, along with Bootstrap Icons and Google Fonts).

- `location.hash` (e.g. `#/projects/zboe2`) drives everything. `routeToPath()` maps a route to
  `pages/<route>.html`, sanitizing path segments to strip traversal and non-word characters.
- `loadRoute()` fetches that fragment and swaps it into `#content` in `index.html`. Fragments are
  bare HTML (no `<html>`/`<head>`) — see any file under `pages/`. Fetched fragments are cached in an
  in-memory `Map` for the session.
- Adding a page = drop a new `pages/<name>.html` fragment and add a link with `href="#/<name>"`
  (and, for a project, a `<li>` in the Projects dropdown in `index.html`). No router registration
  needed.
- `document.title` is derived from the fragment's `<h1>` after it loads.

**GitHub sidebar** (`repoCards` / `repoCardsMobile` in `index.html`) is populated independently of
the router:

- Repos to track live in `config.js` (`window.SITE_CONFIG.repos`), each an `{owner, repo, label}`.
  That's the only file to edit to change what the sidebar shows.
- `gh()` wraps `fetch` to the GitHub REST API, honors an optional token from `SITE_CONFIG.token`
  (raises the unauthenticated 60 req/hr limit to 5,000, but is visible to every visitor — only set
  it on a non-public build), and caches responses in `sessionStorage` for `CFG.cacheMinutes`.
- `fetchRepo()` pulls repo metadata, recent commits, branches, and (if
  `CFG.showActivityGraph`) 12-week commit participation stats, in parallel per repo.
- Each card is rendered independently and replaced in place (`paint()`), so one repo failing (rate
  limit, 404, network) doesn't block the others — see `errorHTML()` for the per-error messaging.
- The "Refresh" button forces a re-fetch bypassing the `sessionStorage` cache.

**Theme**: dark/light toggled via `data-bs-theme` on `<html>`, persisted to `localStorage`, initial
value read in `initTheme()` before first paint.

**Styling**: `style.css` defines the visual language on top of Bootstrap using CSS custom properties
(`--accent`, `--font-display`, etc.) that swap per `data-bs-theme`. Custom classes worth knowing:
`.repo-card` / `.repo-section` / `.repo-label` (sidebar cards), `.page-title` / `.page-eyebrow` /
`.page-lead` (page fragment headers) — reuse these classes in new page fragments rather than
inventing new ones.

## Directory notes

- `pages/` — routed HTML fragments (`home`, `about`, `contact`, `homelab`, `zboe2`).
- `mnt/user-data/outputs/site/pages/projects/index.html` — a drafted `#/projects/index` fragment
  (the "All projects" link in the nav dropdown) that has not been moved into `pages/projects/` yet.
