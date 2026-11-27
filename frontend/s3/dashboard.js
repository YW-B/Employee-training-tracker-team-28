// EN: Dashboard page logic. Calls only Service 3 (summary, trend, attention, employees) plus S1 /api/teams
//     for the team list. All numbers come from the backend; the page never calculates compliance itself.
// Franco: Logic page el dashboard. Bey-kallem Service 3 bas (summary, trend, attention, employees) w S1
//     /api/teams 3ashan list el teams. Kol el ar2am gaya men el backend; el page 3omraha ma bt7seb compliance.
'use strict';
(function () {
  const { api, ui, s3 } = window.ETT;
  const { el } = ui;
  if (!ui.startPage(['Manager'])) return;

  const teamSelect = document.getElementById('team');
  const statusSelect = document.getElementById('status');
  const base = () => `/api/dashboard/teams/${encodeURIComponent(teamSelect.value)}`;

  // EN: the summary cards (contract 6.1).
  // Franco: cards el molakhas (contract 6.1).
  function renderSummary(s) {
    // EN: the colour band of each card: green = fine, orange = watch it, red = a problem to fix.
    // Franco: lon el sharee7a: akhdar = tamam, borto2any = khally balak, a7mar = moshkela lazem tet7al.
    const card = (value, label, kind) => el('div', { class: `card ${kind}` }, el('div', { class: 'value' }, value), el('div', { class: 'label' }, label));
    const problem = (n) => (n > 0 ? 'bad' : 'ok');
    const rateKind = s.complianceRate >= 90 ? 'ok' : s.complianceRate >= 70 ? 'warn' : 'bad';
    document.getElementById('summary').replaceChildren(
      card(`${s.complianceRate}%`, 'Compliance rate', rateKind),
      card(`${s.compliantCount} / ${s.employeeCount}`, 'Compliant employees', rateKind),
      card(s.nonCompliantByReason.OverdueTraining, 'With overdue training', problem(s.nonCompliantByReason.OverdueTraining)),
      card(s.nonCompliantByReason.CertificateMissing, 'Certificate missing', problem(s.nonCompliantByReason.CertificateMissing)),
      card(s.nonCompliantByReason.CertificateExpired, 'Certificate expired', problem(s.nonCompliantByReason.CertificateExpired)),
      card(s.expiringWithin30Days, 'Certificates expiring in 30 days', s.expiringWithin30Days > 0 ? 'warn' : 'ok'),
    );
  }

  // EN: the trend (contract 6.4) as a simple bar chart drawn with SVG: one bar per day, height = rate.
  // Franco: el trend (contract 6.4) ka bar chart basit b SVG: bar le kol yom, el ertefa3 = el nesba.
  function renderTrend(t) {
    const box = document.getElementById('trend');
    if (!t.points.length) {
      box.replaceChildren(el('p', { class: 'empty' }, 'No daily snapshots yet. They are saved once a day by the scheduled job.'));
      return;
    }
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const width = 600;
    const height = 200;
    const gap = 2;
    const barWidth = Math.max(4, (width - 40) / t.points.length - gap);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Compliance rate per day');
    t.points.forEach((p, i) => {
      const h = (p.complianceRate / 100) * (height - 30);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('class', 'bar');
      rect.setAttribute('x', 30 + i * (barWidth + gap));
      rect.setAttribute('y', height - 20 - h);
      rect.setAttribute('width', barWidth);
      rect.setAttribute('height', Math.max(h, 1));
      const title = document.createElementNS(NS, 'title');
      title.textContent = `${p.date}: ${p.complianceRate}% of ${p.employeeCount}`;
      rect.append(title);
      svg.append(rect);
    });
    const label = (text, x, y) => {
      const node = document.createElementNS(NS, 'text');
      node.setAttribute('x', x);
      node.setAttribute('y', y);
      node.textContent = text;
      svg.append(node);
    };
    label('100%', 0, 14);
    label('0%', 0, height - 20);
    label(t.points[0].date, 30, height - 4);
    label(t.points[t.points.length - 1].date, width - 70, height - 4);
    box.replaceChildren(svg);
  }

  // EN: one row per employee: name, status, reasons, worst days, soonest expiry.
  // Franco: satr le kol mowazzaf: el esm, el status, el asbab, akbar 3adad ayam, a2rab tareekh entehaa.
  const COLUMNS = [
    ['Employee', (r) => r.name],
    ['Status', (r) => s3.pill(r.status)],
    ['Reasons', (r) => s3.reasonsText(r.reasons)],
    ['Days overdue', (r) => r.daysOverdueMax || '-', 'num'],
    ['Days expired', (r) => r.daysExpiredMax || '-', 'num'],
    ['Expires soon', (r) => r.soonestExpiry || '-'],
  ];

  async function loadEmployees() {
    const query = statusSelect.value ? `?status=${encodeURIComponent(statusSelect.value)}` : '';
    const rows = await api.get(`${base()}/employees${query}`);
    document.getElementById('employees').replaceChildren(s3.table(COLUMNS, rows, 'No employees match.'));
  }

  // EN: load everything for the chosen team in parallel. If one call fails the banner shows why,
  //     and no half-filled numbers are left on screen.
  // Franco: ne7ammel kol 7aga lel team fe nafs el wa2t. Law call fashal el banner beywarry leh,
  //     w mafeesh ar2am nos-nos btefdal 3ala el shasha.
  async function loadAll() {
    if (!teamSelect.value) return;
    for (const id of ['summary', 'trend', 'attention', 'employees']) document.getElementById(id).replaceChildren();
    const [summary, trend, attention] = await Promise.all([
      api.get(`${base()}/summary`),
      api.get(`${base()}/trend?days=30`),
      api.get(`${base()}/attention`),
    ]);
    renderSummary(summary);
    renderTrend(trend);
    document.getElementById('attention').replaceChildren(s3.table(COLUMNS, attention, 'Nobody needs attention right now.'));
    await loadEmployees();
  }

  const refresh = document.getElementById('refresh');
  teamSelect.addEventListener('change', () => ui.busy(refresh, loadAll));
  statusSelect.addEventListener('change', () => ui.busy(null, loadEmployees));
  refresh.addEventListener('click', () => ui.busy(refresh, loadAll));

  ui.busy(refresh, async () => {
    const teams = await s3.loadTeams(teamSelect);
    if (!teams.length) {
      ui.showInfo('You do not manage a team yet.');
      return;
    }
    await loadAll();
  });
}());
