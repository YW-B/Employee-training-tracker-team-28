// EN: Home page: one card per page the signed-in role may open (same list as the top bar).
// Franco: El home: card le kol page el role da yefta7ha (nafs list el bar el fo2any).
'use strict';
(function () {
  const { ui } = window.ETT;
  const user = ui.startPage();
  if (!user) return;
  const menu = document.getElementById('menu');
  for (const link of ui.linksFor(user).filter((l) => l.href !== '/home.html')) {
    menu.append(ui.el('a', { class: 'card', href: link.href }, ui.el('div', { class: 'value' }, link.text)));
  }
}());
