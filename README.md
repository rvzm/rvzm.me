# rvzm.me

Source for [rvzm.me](https://rvzm.me) — a personal site built as a single HTML shell with a
client-side hash router, no framework and no build step. A sidebar pulls live commit/branch
activity for a configurable list of GitHub repos.

## Stack

- [Bootstrap 5](https://getbootstrap.com/) + [Bootstrap Icons](https://icons.getbootstrap.com/) via CDN
- Vanilla JS (`assets/js/app.js`) — hash router, GitHub sidebar, theme toggle
- Plain HTML page fragments under `pages/`, swapped into `#content` by the router
- No package manager, no build step, no server-side code — nginx serves the directory as-is

## Structure

```
index.html            shell page: navbar, content mount, sidebar
assets/css/style.css   all styling
assets/js/config.js    site config — nav links, tracked repos, sidebar options
assets/js/app.js       router + GitHub sidebar logic
pages/                 routed HTML fragments (one per page)
pages/projects/        project subpages + the "All projects" index
```

## Running locally

There's no dev server. Serve the directory over HTTP so fragment fetches work (`file://` won't):

```
python3 -m http.server -d . 8000
```

Then open `http://localhost:8000`.

## Configuration

Everything content-related lives in `assets/js/config.js`:

- **`nav`** — the navbar. Plain items are `{ page, src }`; a dropdown is
  `{ dropdown, links: [...] }`, where `links` can also contain `{ divider: true }`. `src` is a path
  under `pagesDir`; the route/hash is `src` minus `.html`.
- **`repos`** — GitHub repos shown in the sidebar (`{ owner, repo, label? }`), each rendered as a
  card with recent commits, branches, and a 12-week activity sparkline.
- **`site_owner`** — repos owned by this account get a "report an issue" shortcut on their card.
- **`token`** — optional read-only GitHub token to raise the API rate limit. It's visible to every
  visitor, so only set it on a non-public build.

Adding a page: drop a fragment in `pages/` and add a matching entry to `nav`. No routing code to
touch.

## Deployment

nginx serves this directory directly as `rvzm.me`'s document root — there's no deploy step, editing
a file here changes the live site. The domain sits behind Cloudflare; `assets/` is served with
`Cache-Control: no-cache` so edits show up immediately instead of waiting out Cloudflare's default
edge cache for static files.
