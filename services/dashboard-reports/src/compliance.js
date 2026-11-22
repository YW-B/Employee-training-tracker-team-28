// EN: Service 3 core compliance rules. Pure functions only: no HTTP, no database, no clock.
//     The caller passes "today" ("YYYY-MM-DD", UTC) so every result is repeatable and easy to test.
//     This is S3's own business logic (TA feedback: "define what compliant means").
// Franco: El rules el asaseya bta3et Service 3. Functions basita bas: mafeesh HTTP wala database wala sa3a.
//     El caller beyeb3at "today" (tareekh UTC) 3ashan el natiga tetkarrar w tet-test b-sohoola.
//     Da el business logic bta3 S3 (feedback el TA: "3arrafo ya3ni eh compliant").
//
// EN: Input shapes come from docs/API_CONTRACT.md:
//     assignment (S1, section 3): { employeeId, trainingId, category, dueDate: "YYYY-MM-DD", completedAt: ISO | null }
//     S2 compliance (section 5.9): { teamId, employees: [ { employeeId, certificates: [...], flags: [ { flagType, trainingId } ] } ] }
//     flagsFromContract() turns the S2 answer into the simple internal flag list used below:
//     { employeeId, trainingId, category, type: "Missing" | "Expired" | "ExpiringSoon", expiryDate, status }
// Franco: Shakl el data gai men docs/API_CONTRACT.md. flagsFromContract() bet7awwel rad S2 le list flags
//     basita bnesta3melha ta7t.
'use strict';

const COMPLIANT = 'Compliant';
const NON_COMPLIANT = 'Non-compliant';

// EN: Reasons always come out in this fixed order, so tests and the UI see a stable list.
// Franco: El reasons dayman betetla3 bel tarteeb da, 3ashan el tests w el UI yeshoofo list sabta.
const OVERDUE_TRAINING = 'OverdueTraining';
const CERTIFICATE_MISSING = 'CertificateMissing';
const CERTIFICATE_EXPIRED = 'CertificateExpired';
const REASON_ORDER = [OVERDUE_TRAINING, CERTIFICATE_MISSING, CERTIFICATE_EXPIRED];

const DAY_MS = 24 * 60 * 60 * 1000;

// EN: "YYYY-MM-DD" or a full ISO timestamp -> number of days since 1970 (UTC). null stays null.
//     Working in whole UTC days avoids time-zone surprises.
// Franco: "YYYY-MM-DD" aw timestamp kamel -> 3adad el ayam men 1970 (UTC). El null yefdal null.
function toDay(value) {
  if (value === null || value === undefined) return null;
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

// EN: today's UTC date as "YYYY-MM-DD" (used by the endpoints, never inside the rules).
// Franco: tareekh el naharda UTC ka "YYYY-MM-DD" (lel endpoints bas, mesh gowwa el rules).
function todayUtc(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

// EN: Overdue rule: dueDate < today AND completedAt is null. Due today is NOT overdue.
//     Completed late is not overdue either, because it is completed.
// Franco: Rule el Overdue: dueDate abl el naharda W completedAt fady. Law el due el naharda yeb2a mesh overdue.
//     W law khallas met2akhar bardo mesh overdue, 3ashan khalas khallas.
function isOverdue(assignment, today) {
  return assignment.completedAt == null && toDay(assignment.dueDate) < toDay(today);
}

// EN: Only open flags count; a flag S2 marks "resolved" is ignored (no status = open).
// Franco: El flags el maftoo7a bas hya elly betet7seb; law "resolved" mesh benbos 3aleiha.
function isOpen(flag) {
  return (flag.status || 'open') === 'open';
}

// EN: Decide if ONE employee is Compliant, using only that employee's assignments and flags.
//     Compliant = no Overdue assignment AND no open Missing/Expired flag. Expiring soon stays Compliant.
// Franco: Bet2arrer law mowazzaf WA7ED Compliant, men el assignments w el flags bta3to bas.
//     Compliant = mafeesh assignment Overdue W mafeesh flag Missing/Expired maftoo7. El Expiring soon lessa Compliant.
function evaluateEmployee(assignments, flags, today) {
  const t = toDay(today);
  const reasons = new Set();
  let daysOverdueMax = 0;
  let daysExpiredMax = 0;
  let soonest = null;

  for (const a of assignments) {
    if (isOverdue(a, today)) {
      reasons.add(OVERDUE_TRAINING);
      daysOverdueMax = Math.max(daysOverdueMax, t - toDay(a.dueDate));
    }
  }

  for (const f of flags) {
    if (!isOpen(f)) continue;
    if (f.type === 'Missing') {
      reasons.add(CERTIFICATE_MISSING);
    } else if (f.type === 'Expired') {
      reasons.add(CERTIFICATE_EXPIRED);
      const expiry = toDay(f.expiryDate);
      if (expiry !== null) daysExpiredMax = Math.max(daysExpiredMax, t - expiry);
    } else if (f.type === 'ExpiringSoon') {
      // EN: Not a problem yet; only remember the soonest date for the attention list.
      // Franco: Lessa mesh moshkela; bas benefakkar a2rab tareekh 3ashan el attention list.
      if (f.expiryDate && (soonest === null || f.expiryDate < soonest)) soonest = String(f.expiryDate).slice(0, 10);
    }
  }

  return {
    status: reasons.size ? NON_COMPLIANT : COMPLIANT,
    reasons: REASON_ORDER.filter((r) => reasons.has(r)),
    expiringSoon: soonest !== null,
    daysOverdueMax,
    daysExpiredMax,
    soonestExpiry: soonest,
  };
}

// EN: Evaluate every employee of a team. With a category, only that category's assignments/flags count.
//     Every employee stays in the list (an employee with nothing in the category is Compliant for it).
// Franco: Bet-evaluate kol mowazzaf fel team. Law fi category, assignments/flags el category di bas betet7seb.
//     Kol mowazzaf beyfdal fel list (elly malosh 7aga fel category yeb2a Compliant fiha).
function evaluateTeam(employees, assignments, flags, today, category = null) {
  let a = assignments;
  let f = flags;
  if (category !== null && category !== undefined) {
    a = a.filter((x) => x.category === category);
    f = f.filter((x) => x.category === category);
  }
  return employees.map((emp) => ({
    employeeId: emp.id,
    name: emp.name || '',
    ...evaluateEmployee(
      a.filter((x) => x.employeeId === emp.id),
      f.filter((x) => x.employeeId === emp.id),
      today,
    ),
  }));
}

// EN: Compliance rate = compliant / all x 100, rounded to 1 decimal. Empty team -> 0 (no division by zero).
// Franco: Nesbet el compliance = el compliant / el kol x 100, mat2arraba le rakam 3ashari wa7ed. Team fady -> 0.
function complianceRate(rows) {
  if (!rows.length) return 0;
  const compliant = rows.filter((r) => r.status === COMPLIANT).length;
  return Math.round((compliant / rows.length) * 1000) / 10;
}

// EN: Attention list: non-compliant first (longest overdue/expired first), then Compliant-but-expiring-soon
//     (soonest expiry first). Fully OK employees are left out. Ties are broken by employeeId so the order is stable.
// Franco: El attention list: el non-compliant el awel (el at2akhar aktar el awel), ba3den el Compliant elly
//     certificate-o 2arrab yekhlas (el a2rab el awel). Elly tamam khales mesh beyedkhol. El ta3adol bel employeeId.
function attentionOrder(rows) {
  const byId = (x, y) => String(x.employeeId).localeCompare(String(y.employeeId));
  const worst = (r) => Math.max(r.daysOverdueMax, r.daysExpiredMax);
  const nonCompliant = rows.filter((r) => r.status === NON_COMPLIANT)
    .sort((x, y) => worst(y) - worst(x) || byId(x, y));
  const expiring = rows.filter((r) => r.status === COMPLIANT && r.expiringSoon)
    .sort((x, y) => String(x.soonestExpiry).localeCompare(String(y.soonestExpiry)) || byId(x, y));
  return [...nonCompliant, ...expiring];
}

// EN: Adapter: S2's /api/compliance/teams/{teamId} answer -> internal flags.
//     - Each S2 flag (Missing / Expired) becomes a flag; its category comes from the matching S1 assignment
//       (same employee + training). For Expired we take the expiry date of the newest Verified certificate
//       of that training, so we can count "days expired".
//     - "Expiring soon" is worked out here from the dates: the newest Verified certificate of a training
//       expires in 0-30 days. Only Verified certificates count (Pending / Rejected never do).
// Franco: Adapter: rad S2 -> flags dakhleya. Kol flag Missing/Expired men S2 beyb2a flag, w el category
//     gaya men el assignment bta3 S1. "Expiring soon" ben7sebha hena men el tawareekh: a7das certificate
//     Verified lel training dah beyekhlas fe 0-30 yom. El Verified bas betet7seb.
function flagsFromContract(s2, assignments, today) {
  const t = toDay(today);
  const categoryOf = new Map();
  for (const a of assignments) categoryOf.set(`${a.employeeId}|${a.trainingId}`, a.category);
  const out = [];

  for (const emp of (s2 && s2.employees) || []) {
    // EN: newest Verified certificate per training (latest expiry date wins).
    // Franco: a7das certificate Verified le kol training (a7das tareekh entehaa).
    const newest = new Map();
    for (const c of emp.certificates || []) {
      if (c.reviewStatus !== 'Verified' || !c.expiryDate) continue;
      const prev = newest.get(c.trainingId);
      if (!prev || c.expiryDate > prev.expiryDate) newest.set(c.trainingId, c);
    }
    const category = (trainingId) => categoryOf.get(`${emp.employeeId}|${trainingId}`) || null;

    for (const f of emp.flags || []) {
      if (f.flagType !== 'Missing' && f.flagType !== 'Expired') continue;
      const cert = newest.get(f.trainingId);
      out.push({
        employeeId: emp.employeeId,
        trainingId: f.trainingId,
        category: category(f.trainingId),
        type: f.flagType,
        expiryDate: f.flagType === 'Expired' && cert ? cert.expiryDate : null,
        status: f.status || 'open',
      });
    }

    for (const [trainingId, cert] of newest) {
      const daysLeft = toDay(cert.expiryDate) - t;
      if (daysLeft >= 0 && daysLeft <= 30) {
        out.push({
          employeeId: emp.employeeId, trainingId, category: category(trainingId),
          type: 'ExpiringSoon', expiryDate: cert.expiryDate, status: 'open',
        });
      }
    }
  }
  return out;
}

module.exports = {
  COMPLIANT, NON_COMPLIANT, OVERDUE_TRAINING, CERTIFICATE_MISSING, CERTIFICATE_EXPIRED, REASON_ORDER,
  toDay, todayUtc, isOverdue, evaluateEmployee, evaluateTeam, complianceRate, attentionOrder, flagsFromContract,
};
