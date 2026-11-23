// EN: Reports page logic (contract 6.6-6.9). Generate = JSON report shown as a table; Download CSV = the
//     same report as a file (the backend escapes formula cells); history lists past runs and can delete one.
// Franco: Logic page el reports (contract 6.6-6.9). Generate = report JSON beyetla3 ka gadwal; Download CSV =
//     nafs el report ka file (el backend bey-7mi men cells el formula); el history bey-list el reports el adeema
//     w momken nemsa7 wa7ed.
'use strict';
(function () {
  const { api, ui, s3 } = window.ETT;
  const { el } = ui;
  if (!ui.startPage(['Manager'])) return;

  const teamSelect = document.getElementById('team');
  const categoryInput = document.getElementById('category');
  const generateButton = document.getElementById('generate');
  const exportButton = document.getElementById('export');

  // EN: "?category=Safety" or "" (an empty box means every category).
  // Franco: "?category=Safety" aw "" (el khana el fadya ya3ni kol el categories).
  function query() {
    const category = categoryInput.value.trim();
    return category ? `?category=${encodeURIComponent(category)}` : '';
  }
  const reportPath = () => `/api/reports/teams/${encodeURIComponent(teamSelect.value)}`;

  const REPORT_COLUMNS = [
    ['Employee', (r) => r.name],
    ['Training', (r) => r.trainingName],
    ['Category', (r) => r.category],
    ['Assignment', (r) => s3.pill(r.assignmentStatus)],
    ['Due date', (r) => r.dueDate],
    ['Certificate', (r) => s3.pill(r.certificateStatus)],
    ['Compliance', (r) => s3.pill(r.compliance)],
  ];

  async function generate() {
    const report = await api.get(`${reportPath()}${query()}`);
    const title = document.getElementById('report-title');
    title.hidden = false;
    title.textContent = `Report${report.category ? ` - ${report.category}` : ''} (${report.rows.length} rows, ${new Date(report.generatedAt).toLocaleString()})`;
    document.getElementById('report').replaceChildren(s3.table(REPORT_COLUMNS, report.rows, 'No assignments for this team and category.'));
    await loadHistory();
  }

  async function exportCsv() {
    const category = categoryInput.value.trim();
    const name = `team-report${category ? `-${category.replace(/[^A-Za-z0-9_-]/g, '_')}` : ''}.csv`;
    await api.download(`${reportPath()}/export${query()}`, name);
    await loadHistory();
  }

  // EN: report history (only this manager's teams come back from the backend). Team names come from the
  //     team list we already have; delete asks first, then calls DELETE and reloads.
  // Franco: tareekh el reports (el backend beyrga3 teams el manager da bas). Asamy el teams men list el teams
  //     elly 3andena; el delete bey-es2al el awel, ba3den beynady DELETE w ye3mel reload.
  let teamNames = new Map();
  async function loadHistory() {
    const runs = await api.get('/api/reports/history');
    const columns = [
      ['When', (r) => new Date(r.generatedAt).toLocaleString()],
      ['Team', (r) => teamNames.get(r.teamId) || r.teamId],
      ['Category', (r) => r.category || 'All'],
      ['Rows', (r) => r.rowCount, 'num'],
      ['', (r) => el('button', { type: 'button', class: 'danger', onclick: (e) => remove(e.currentTarget, r.id) }, 'Delete')],
    ];
    document.getElementById('history').replaceChildren(s3.table(columns, runs, 'No reports yet.'));
  }

  function remove(button, id) {
    if (!window.confirm('Delete this report from the history?')) return;
    ui.busy(button, async () => {
      await api.del(`/api/reports/history/${encodeURIComponent(id)}`);
      ui.showInfo('Report deleted.');
      await loadHistory();
    });
  }

  document.getElementById('report-form').addEventListener('submit', (event) => {
    event.preventDefault();
    ui.busy(generateButton, generate);
  });
  exportButton.addEventListener('click', () => ui.busy(exportButton, exportCsv));

  ui.busy(generateButton, async () => {
    const teams = await s3.loadTeams(teamSelect);
    teamNames = new Map(teams.map((t) => [t.id, t.name]));
    if (!teams.length) ui.showInfo('You do not manage a team yet.');
    await loadHistory();
  });
}());
