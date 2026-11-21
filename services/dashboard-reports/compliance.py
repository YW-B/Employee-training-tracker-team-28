# EN: Service 3 core compliance rules. Pure functions only: no HTTP, no database, no clock.
#     The caller passes "today" (UTC date) so every result is repeatable and easy to test.
# Franco: El rules el asaseya bta3et Service 3. Functions basita bas: mafeesh HTTP wala database wala sa3a.
#     El caller beyeb3at "today" (tareekh UTC) 3ashan el natiga tetkarrar w tet-test b-sohoola.
#
# EN: Input shapes we expect (to be confirmed against docs/API_CONTRACT.md once the foundation is merged):
#     assignment (from S1): {"employeeId", "trainingId", "category", "dueDate": "YYYY-MM-DD", "completedAt": str|None}
#     flag (from S2):       {"employeeId", "trainingId", "category", "type": "Missing"|"Expired"|"ExpiringSoon",
#                            "expiryDate": "YYYY-MM-DD"|None, "status": "open"|"resolved" (missing = open)}
# Franco: Shakl el data elly mestanneyinha (lazem net2akked menha fe docs/API_CONTRACT.md lama el foundation yetdamm):
#     el assignment gai men S1 w el flag gai men S2 bel fields elly fo2.

from datetime import date

COMPLIANT = "Compliant"
NON_COMPLIANT = "Non-compliant"

# EN: Reasons always come out in this fixed order, so tests and the UI see a stable list.
# Franco: El reasons dayman betetla3 bel tarteeb da, 3ashan el tests w el UI yeshoofo list sabta.
OVERDUE_TRAINING = "OverdueTraining"
CERTIFICATE_MISSING = "CertificateMissing"
CERTIFICATE_EXPIRED = "CertificateExpired"
REASON_ORDER = [OVERDUE_TRAINING, CERTIFICATE_MISSING, CERTIFICATE_EXPIRED]


# EN: Turn "YYYY-MM-DD" or a full ISO timestamp into a date; None stays None.
# Franco: Ha7awwel "YYYY-MM-DD" aw timestamp kamel le date; el None yefdal None.
def _to_date(value):
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


# EN: Overdue rule: dueDate < today AND completedAt is null. Due today is NOT overdue.
#     Completed late is not overdue either, because it is completed.
# Franco: Rule el Overdue: dueDate abl el naharda W completedAt fady. Law el due el naharda yeb2a mesh overdue.
#     W law khallas met2akhar bardo mesh overdue, 3ashan khalas khallas.
def is_overdue(assignment, today):
    return assignment.get("completedAt") is None and _to_date(assignment["dueDate"]) < today


# EN: Only open flags count; a flag S2 marked "resolved" is ignored.
# Franco: El flags el maftoo7a bas hya elly betet7seb; law S2 3amalha "resolved" mesh benbos 3aleiha.
def _is_open(flag):
    return flag.get("status", "open") == "open"


# EN: Decide if ONE employee is Compliant, using only that employee's assignments and flags.
#     Compliant = no Overdue assignment AND no open Missing/Expired flag. Expiring soon stays Compliant.
# Franco: Bet2arrer law mowazzaf WA7ED Compliant, men el assignments w el flags bta3to bas.
#     Compliant = mafeesh assignment Overdue W mafeesh flag Missing/Expired maftoo7. El Expiring soon lessa Compliant.
def evaluate_employee(assignments, flags, today):
    reasons = set()
    days_overdue_max = 0
    days_expired_max = 0
    soonest_expiry = None

    for a in assignments:
        if is_overdue(a, today):
            reasons.add(OVERDUE_TRAINING)
            days_overdue_max = max(days_overdue_max, (today - _to_date(a["dueDate"])).days)

    for f in flags:
        if not _is_open(f):
            continue
        if f["type"] == "Missing":
            reasons.add(CERTIFICATE_MISSING)
        elif f["type"] == "Expired":
            reasons.add(CERTIFICATE_EXPIRED)
            expiry = _to_date(f.get("expiryDate"))
            if expiry is not None:
                days_expired_max = max(days_expired_max, (today - expiry).days)
        elif f["type"] == "ExpiringSoon":
            # EN: Not a problem yet, only remember the soonest date for the attention list.
            # Franco: Lessa mesh moshkela, bas benefakkar a2rab tareekh 3ashan el attention list.
            expiry = _to_date(f.get("expiryDate"))
            if expiry is not None and (soonest_expiry is None or expiry < soonest_expiry):
                soonest_expiry = expiry

    return {
        "status": NON_COMPLIANT if reasons else COMPLIANT,
        "reasons": [r for r in REASON_ORDER if r in reasons],
        "expiringSoon": soonest_expiry is not None,
        "daysOverdueMax": days_overdue_max,
        "daysExpiredMax": days_expired_max,
        "soonestExpiry": soonest_expiry.isoformat() if soonest_expiry else None,
    }


# EN: Evaluate every employee of a team. With a category, only that category's assignments/flags count.
#     Every employee stays in the list (an employee with nothing in the category is Compliant for it).
# Franco: Bet-evaluate kol mowazzaf fel team. Law fi category, assignments/flags el category di bas betet7seb.
#     Kol mowazzaf beyfdal fel list (elly malosh 7aga fel category yeb2a Compliant fiha).
def evaluate_team(employees, assignments, flags, today, category=None):
    if category is not None:
        assignments = [a for a in assignments if a.get("category") == category]
        flags = [f for f in flags if f.get("category") == category]

    rows = []
    for emp in employees:
        emp_id = emp["id"]
        result = evaluate_employee(
            [a for a in assignments if a["employeeId"] == emp_id],
            [f for f in flags if f["employeeId"] == emp_id],
            today,
        )
        rows.append({"employeeId": emp_id, "name": emp.get("name", ""), **result})
    return rows


# EN: Compliance rate = compliant / all x 100, rounded to 1 decimal. Empty team -> 0 (no division by zero).
# Franco: Nesbet el compliance = el compliant / el kol x 100, mat2arraba le rakam 3ashari wa7ed. Team fady -> 0.
def compliance_rate(rows):
    if not rows:
        return 0.0
    compliant = sum(1 for r in rows if r["status"] == COMPLIANT)
    return round(compliant / len(rows) * 100, 1)


# EN: Attention list: non-compliant first (longest overdue/expired first), then Compliant-but-expiring-soon
#     (soonest expiry first). Fully OK employees are left out. Ties are broken by employeeId so the order is stable.
# Franco: El attention list: el non-compliant el awel (el at2akhar aktar overdue/expired el awel), ba3den el
#     Compliant elly certificate-o 2arrab yekhlas (el a2rab el awel). Elly tamam khales mesh beyedkhol.
#     Law fi ta3adol bnerattab bel employeeId 3ashan el tarteeb yeb2a sabet.
def attention_order(rows):
    non_compliant = [r for r in rows if r["status"] == NON_COMPLIANT]
    expiring = [r for r in rows if r["status"] == COMPLIANT and r["expiringSoon"]]

    non_compliant.sort(key=lambda r: (-max(r["daysOverdueMax"], r["daysExpiredMax"]), str(r["employeeId"])))
    expiring.sort(key=lambda r: (r["soonestExpiry"], str(r["employeeId"])))
    return non_compliant + expiring
