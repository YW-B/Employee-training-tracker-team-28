// EN: Small helpers shared by the two Service 3 pages: the team picker and the status labels.
// Franco: Helpers so8ayyara moshtaraka bein page-ein Service 3: ekhteyar el team w shakl el status.
'use strict';
(function (root) {
  const REASON_TEXT = {
    OverdueTraining: 'Overdue training',
    CertificateMissing: 'Certificate missing',
    CertificateExpired: 'Certificate expired',
  };

  // EN: status -> coloured pill. Compliant = green, Non-compliant = red, anything "soon" = orange.
  // Franco: el status -> pill molawwana. Compliant = akhdar, Non-compliant = a7mar, ay 7aga "soon" = borto2any.
  function pill(text) {
    const t = String(text || '');
    let kind = '';
    if (/^(Compliant|Valid|Completed)$/.test(t)) kind = 'ok';
    else if (/soon|Assigned|Not yet/i.test(t)) kind = 'warn';
    else if (/Non-compliant|Overdue|Missing|Expired/.test(t)) kind = 'bad';
    return root.ETT.ui.el('span', { class: `pill ${kind}` }, t);
  }

  function reasonsText(reasons) {
    return (reasons || []).map((r) => REASON_TEXT[r] || r).join(', ') || '-';
  }

  // EN: fill the team <select> from S1 GET /api/teams (only the manager's own teams come back).
  //     The chosen team is remembered for this tab, so both pages open on the same team.
  // Franco: nemla el <select> bta3 el team men S1 GET /api/teams (el teams bta3et el manager bas bterga3).
  //     El team el mokhtar beyetfakkar fel tab, f el page-ein beyeftaho 3ala nafs el team.
  async function loadTeams(select) {
    const teams = await root.ETT.api.get('/api/teams');
    select.replaceChildren(...teams.map((t) => root.ETT.ui.el('option', { value: t.id }, t.name)));
    const saved = root.sessionStorage.getItem('ett.s3.team');
    if (saved && teams.some((t) => t.id === saved)) select.value = saved;
    select.addEventListener('change', () => root.sessionStorage.setItem('ett.s3.team', select.value));
    return teams;
  }

  // EN: a table from rows: columns = [[header, (row) => cell content, 'num'?], ...]
  // Franco: gadwal men rows: columns = [[header, (row) => el mo7tawa, 'num'?], ...]
  function table(columns, rows, emptyText) {
    const { el } = root.ETT.ui;
    if (!rows.length) return el('p', { class: 'empty' }, emptyText);
    return el('table', {},
      el('thead', {}, el('tr', {}, columns.map(([h, , cls]) => el('th', { class: cls }, h)))),
      el('tbody', {}, rows.map((row) => el('tr', {}, columns.map(([, cell, cls]) => el('td', { class: cls }, cell(row)))))));
  }

  root.ETT = Object.assign(root.ETT || {}, { s3: { pill, reasonsText, loadTeams, table } });
}(window));
