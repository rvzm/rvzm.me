/* Edit this file to change what the sidebar tracks. Nothing else needs touching. */
window.SITE_CONFIG = {

  // Repos shown in the sidebar, top to bottom. One card each.
  repos: [
    { owner: "rvzm", repo: "zboe2", label: "zboe2" },
    { owner: "rvzm",    repo: "rvzm.me" },
    { owner: "twbs", repo: "bootstrap" }
  ],

  // Navbar structure. Plain items are { page, src }; a dropdown is
  // { dropdown, links: [...] } where links can also contain { divider: true }.
  // "src" is relative to pagesDir; the route (and href) is src minus ".html".
  nav: [
    { page: "Home", src: "home.html" },
    { page: "About", src: "about.html" },
    { dropdown: "Projects", links: [
        { page: "zboe2", src: "projects/zboe2.html" },
        { page: "Homelab", src: "projects/homelab.html" },
        { page: "web", src: "projects/web.html" },
        { divider: true },
        { page: "All projects", src: "projects/index.html" }
    ]},
    { page: "Contact", src: "contact.html" }
  ],

  // Repos under this owner get a "report an issue" button in the sidebar.
  site_owner: "rvzm",

  // Optional read-only GitHub token. Raises the limit from 60 to 5,000 requests
  // per hour. Anything you put here is visible to every visitor — only use one
  // on a private/internal build, or leave it empty and rely on the cache below.
  token: "",

  commitsToShow: 4,      // commits listed per card
  branchesToShow: 5,     // branches listed per card
  cacheMinutes: 10,      // responses reused from sessionStorage for this long
  showActivityGraph: true,

  defaultRoute: "home",
  pagesDir: "pages",
  siteName: "rvzm.me"
};
