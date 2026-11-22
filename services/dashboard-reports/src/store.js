// EN: S3's OWN data in the database (tables compliance_snapshots and report_runs, see infra/db/schema.sql).
//     S3 connects as its own least-privilege role svc_s3, which may only touch these two tables.
//     Every query goes through services/common/db.js, so it is always parameterised ($1, $2...).
// Franco: El data el KHASA b S3 fel database (gadwal compliance_snapshots w report_runs).
//     S3 betdkhol bel role bta3ha svc_s3 elly mesmoo7lo yelmes el gadwaleen dol bas.
//     Kol query bet-3ady 3ala services/common/db.js, f dayman parameterised ($1, $2...).
'use strict';

// EN: one row per employee per day. If the row already exists (job ran twice the same day) we UPDATE it,
//     thanks to the UNIQUE (employee_id, snapshot_date) constraint, so there are never duplicates.
// Franco: satr wa7ed lel mowazzaf fel yom. Law el satr mawgood (el job eshtaghal marteen) ben-UPDATE,
//     3ashan el UNIQUE (employee_id, snapshot_date), f 3omr ma yeb2a fi takraar.
const UPSERT_SNAPSHOT = `
  INSERT INTO compliance_snapshots (snapshot_date, team_id, employee_id, status, reasons, overdue_count, expiring_count)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT (employee_id, snapshot_date) DO UPDATE
    SET team_id = EXCLUDED.team_id, status = EXCLUDED.status, reasons = EXCLUDED.reasons,
        overdue_count = EXCLUDED.overdue_count, expiring_count = EXCLUDED.expiring_count`;

// EN: per day: how many employees, how many were Compliant. "Compliant" is passed as $2 (no quotes in SQL).
// Franco: le kol yom: kam mowazzaf w kam menhom Compliant. "Compliant" bey-et-ba3at ka $2 (mafeesh quotes fel SQL).
const TREND = `
  SELECT snapshot_date::text AS date,
         count(*)::int AS employee_count,
         (count(*) FILTER (WHERE status = $2))::int AS compliant_count
    FROM compliance_snapshots
   WHERE team_id = $1 AND snapshot_date >= $3::date AND snapshot_date <= $4::date
   GROUP BY snapshot_date
   ORDER BY snapshot_date`;

// EN: report history (report_runs). The caller's team ids are passed as ONE array parameter ($1).
// Franco: tareekh el reports (report_runs). El team ids bta3et el caller bet-et-ba3at ka array wa7ed ($1).
const INSERT_REPORT_RUN = `
  INSERT INTO report_runs (team_id, category, generated_by, row_count)
  VALUES ($1, $2, $3, $4)
  RETURNING id, generated_at`;
const LIST_REPORT_RUNS = `
  SELECT id, team_id, category, generated_by, generated_at, row_count
    FROM report_runs
   WHERE team_id = ANY($1::uuid[])
   ORDER BY generated_at DESC
   LIMIT 100`;
const GET_REPORT_RUN = 'SELECT id, team_id FROM report_runs WHERE id = $1';
const DELETE_REPORT_RUN = 'DELETE FROM report_runs WHERE id = $1';

function createStore(db) {
  // EN: write all snapshot rows of one run in ONE transaction: either the whole day is saved or nothing.
  // Franco: nekteb kol rows el snapshot fe transaction WA7DA: ya el yom kollo yetsayyev ya wala 7aga.
  async function upsertSnapshots(snapshotDate, rows) {
    await db.withTransaction(async (tx) => {
      for (const r of rows) {
        await tx.query(UPSERT_SNAPSHOT, [
          snapshotDate, r.teamId, r.employeeId, r.status, r.reasons, r.overdueCount, r.expiringCount,
        ]);
      }
    });
    return rows.length;
  }

  // EN: daily totals for one team between two dates (inclusive).
  // Franco: el magamee3 el yomeya le team wa7ed bein tareekhein.
  async function trend(teamId, fromDate, toDate) {
    return db.query(TREND, [teamId, 'Compliant', fromDate, toDate]);
  }

  // EN: report history helpers. Dates come back as JS Date objects; we send them as ISO text.
  // Franco: helpers tareekh el reports. El tawareekh betrga3 Date; benba3atha ka ISO text.
  async function addReportRun(teamId, category, generatedBy, rowCount) {
    const row = await db.queryOne(INSERT_REPORT_RUN, [teamId, category, generatedBy, rowCount]);
    return { id: row.id, generatedAt: new Date(row.generated_at).toISOString() };
  }

  async function listReportRuns(teamIds) {
    const rows = await db.query(LIST_REPORT_RUNS, [teamIds]);
    return rows.map((r) => ({
      id: r.id,
      teamId: r.team_id,
      category: r.category,
      generatedBy: r.generated_by,
      generatedAt: new Date(r.generated_at).toISOString(),
      rowCount: r.row_count,
    }));
  }

  async function getReportRun(id) {
    const row = await db.queryOne(GET_REPORT_RUN, [id]);
    return row ? { id: row.id, teamId: row.team_id } : null;
  }

  async function deleteReportRun(id) {
    await db.query(DELETE_REPORT_RUN, [id]);
  }

  return { upsertSnapshots, trend, addReportRun, listReportRuns, getReportRun, deleteReportRun };
}

module.exports = { createStore };
