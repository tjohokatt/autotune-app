// Tiny hash router: one view per mode, so the phone's back button works
// and a mode can be bookmarked (e.g. .../autotune-app/#/autotune).

export const ROUTES = ['home', 'autotune', 'dialekt'];

/** Map a location hash like "#/autotune" to a route name; unknown → "home". */
export function parseRoute(hash) {
  const name = (hash ?? '').replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES.includes(name) ? name : 'home';
}

/**
 * Show the matching [data-view] element and call onChange(next, prev)
 * whenever the route changes (including once at startup with prev = null).
 */
export function startRouter(root, onChange) {
  let current = null;
  function render() {
    const next = parseRoute(location.hash);
    if (next === current) return;
    for (const view of root.querySelectorAll('[data-view]')) view.hidden = view.dataset.view !== next;
    const prev = current;
    current = next;
    window.scrollTo(0, 0);
    onChange?.(next, prev);
  }
  window.addEventListener('hashchange', render);
  render();
}
