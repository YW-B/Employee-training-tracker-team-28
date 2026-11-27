// EN: Small page helpers shared by every page: the top navigation, the error banner, and el() which
//     builds HTML elements safely. Data from the API is ALWAYS put in with textContent, never innerHTML,
//     so a name like <script> shows as text and cannot run (protection against XSS).
// Franco: Helpers so8ayyara moshtaraka le kol page: el navigation fo2, el error banner, w el() elly
//     bteb-ny HTML elements b-amaan. El data elly gaya men el API DAYMAN bt-et7att b textContent, 3omrena ma
//     bnesta3mel innerHTML, f esm zay <script> beytla3 ka text w mayeshtaghalsh (7emaya men XSS).
'use strict';
(function (root) {
  // EN: el('td', { class: 'num' }, 'text', otherElement) -> a new element. Strings become text nodes.
  // Franco: el('td', {...}, 'kalam', element) -> element gedeed. El strings bet-tegi ka text bas.
  function el(tag, attrs = {}, ...children) {
    const node = root.document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) {
      if (child === undefined || child === null || child === false) continue;
      node.append(child instanceof root.Node ? child : root.document.createTextNode(String(child)));
    }
    return node;
  }

  // EN: banners go right under the top bar (or at the top of the page when there is no bar, e.g. sign-in).
  // Franco: el banners beteegi ta7t el bar el fo2any 3ala tool (aw fo2 khales law mafeesh bar, zay el login).
  function placeBanner(banner) {
    const bar = root.document.querySelector('.topbar');
    if (bar) bar.after(banner);
    else root.document.body.prepend(banner);
  }

  // EN: the red banner at the top of the page. showError(null) hides it.
  // Franco: el banner el a7mar fo2 el page. showError(null) bey-khabbeeh.
  function showError(message) {
    let banner = root.document.getElementById('error-banner');
    if (!banner) {
      banner = el('div', { id: 'error-banner', class: 'banner error', role: 'alert', hidden: true });
      placeBanner(banner);
    }
    banner.textContent = message || '';
    banner.hidden = !message;
  }

  function showInfo(message) {
    let banner = root.document.getElementById('info-banner');
    if (!banner) {
      banner = el('div', { id: 'info-banner', class: 'banner info', role: 'status', hidden: true });
      placeBanner(banner);
    }
    banner.textContent = message || '';
    banner.hidden = !message;
  }

  // EN: links in the top bar, by role. Other services add their pages here (one line each).
  // Franco: el links fel bar el fo2any 7asab el role. Kol service tzawwed pages-ha hena (satr wa7ed lel page).
  const NAV_LINKS = [
    { href: '/home.html', text: 'Home', roles: ['Employee', 'Manager'] },
    { href: '/s1/my-trainings.html', text: 'My trainings', roles: ['Employee', 'Manager'] },
    { href: '/s2/my-certificates.html', text: 'My certificates', roles: ['Employee', 'Manager'] },
    { href: '/s1/team.html', text: 'Team trainings', roles: ['Manager'] },
    { href: '/s2/team-certificates.html', text: 'Team certificates', roles: ['Manager'] },
    { href: '/s3/dashboard.html', text: 'Dashboard', roles: ['Manager'] },
    { href: '/s3/reports.html', text: 'Reports', roles: ['Manager'] },
  ];

  function linksFor(user) {
    return NAV_LINKS.filter((l) => l.roles.some((r) => user.roles.includes(r)));
  }

  function renderNav(user) {
    const here = root.location.pathname;
    const nav = el('nav', { class: 'topbar' },
      el('a', { class: 'brand', href: '/home.html' }, 'Training Tracker'),
      el('div', { class: 'links' }, linksFor(user).map((l) => el('a', { href: l.href, class: l.href === here ? 'active' : null }, l.text))),
      el('span', { class: 'who' }, user.roles.join(', ')),
      el('button', { type: 'button', class: 'secondary', onclick: () => root.ETT.auth.signOut() }, 'Sign out'));
    root.document.body.prepend(nav);
    for (const id of ['error-banner', 'info-banner']) {
      const b = root.document.getElementById(id);
      if (b) nav.after(b); // EN: a banner shown before the nav moves under it / Franco: el banner yenzel ta7t el nav
    }
  }

  // EN: one call at the top of each protected page: checks sign-in and role, then draws the nav.
  // Franco: call wa7ed fe awel kol page me7ameya: bey-check el login w el role, ba3den beyersem el nav.
  function startPage(roles = []) {
    const user = root.ETT.auth.requireSignIn(roles);
    if (user) renderNav(user);
    return user;
  }

  // EN: run an async action with the button disabled and errors shown in the banner.
  // Franco: neshaghal action async w el zorar ma2fool w el errors betetla3 fel banner.
  async function busy(button, action) {
    if (button) button.disabled = true;
    showError(null);
    try {
      return await action();
    } catch (err) {
      showError(err.message);
      return undefined;
    } finally {
      if (button) button.disabled = false;
    }
  }

  const api = { el, showError, showInfo, renderNav, startPage, busy, linksFor, NAV_LINKS };
  root.ETT = Object.assign(root.ETT || {}, { ui: api });
  if (typeof module !== 'undefined') module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
