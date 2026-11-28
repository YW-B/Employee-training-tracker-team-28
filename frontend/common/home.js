// EN: Home page: one card per page the signed-in role may open (same list as the top bar).
// Franco: El home: card le kol page el role da yefta7ha (nafs list el bar el fo2any).
'use strict';
(function () {
  const { ui } = window.ETT;
  const user = ui.startPage();
  if (!user) return;
  // EN: we came here from a page this role may not open (see requireSignIn in auth.js).
  // Franco: gayeen hena men page el role da mayenfa3sh yefta7ha (shoof requireSignIn fe auth.js).
  if (new URLSearchParams(window.location.search).get('denied') === '1') {
    ui.showError('Access denied: that page is for Managers only. The server refuses these requests too (HTTP 403).');
  }
  const menu = document.getElementById('menu');
  for (const link of ui.linksFor(user).filter((l) => l.href !== '/home.html')) {
    menu.append(ui.el('a', { class: 'card', href: link.href }, ui.el('div', { class: 'value' }, link.text)));
  }
}());
