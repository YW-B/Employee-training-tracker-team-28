# EN: Unit tests for compliance.py. Every expected value is calculated by hand; "today" is fixed to 2026-11-21.
# Franco: Unit tests le compliance.py. Kol natiga mestanneyinha 7asebnaha b-eedena; "today" sabet 2026-11-21.

import json
from datetime import date
from pathlib import Path

import pytest

from compliance import attention_order, compliance_rate, evaluate_employee, evaluate_team, is_overdue

TODAY = date(2026, 11, 21)
FIXTURES = Path(__file__).parent / "fixtures"


def load(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# EN: Small builders so every table row stays one readable line.
# Franco: Builders so8ayyara 3ashan kol satr fel table yeb2a wa7ed w yetqere b-sohoola.
def asg(due, completed=None, category="Safety"):
    return {"employeeId": "e1", "trainingId": "tr", "category": category, "dueDate": due, "completedAt": completed}


def flag(kind, expiry=None, status="open", category="Safety"):
    return {"employeeId": "e1", "trainingId": "tr", "category": category, "type": kind,
            "expiryDate": expiry, "status": status}


# ---------- is_overdue ----------

# EN: Overdue = due before today AND not completed. Due today and completed-late are NOT overdue.
# Franco: Overdue = el due abl el naharda W mesh mekhallas. El due el naharda w elly khallas met2akhar MESH overdue.
@pytest.mark.parametrize("assignment, expected", [
    (asg("2026-11-20"), True),                                  # yesterday, open
    (asg("2026-11-21"), False),                                 # due today
    (asg("2026-11-22"), False),                                 # due tomorrow
    (asg("2026-11-01", completed="2026-11-10T08:00:00Z"), False),  # completed late
    (asg("2026-11-01", completed="2026-10-30T08:00:00Z"), False),  # completed on time
])
def test_is_overdue(assignment, expected):
    assert is_overdue(assignment, TODAY) is expected


# ---------- evaluate_employee ----------

# EN: One row per rule / edge case: (assignments, flags, status, reasons, expiringSoon, daysOverdueMax,
#     daysExpiredMax, soonestExpiry).
# Franco: Satr le kol rule aw edge case.
@pytest.mark.parametrize(
    "assignments, flags, status, reasons, expiring, overdue_days, expired_days, soonest",
    [
        # no data at all -> Compliant
        ([], [], "Compliant", [], False, 0, 0, None),
        # due today, not completed -> still Compliant
        ([asg("2026-11-21")], [], "Compliant", [], False, 0, 0, None),
        # completed late -> Compliant
        ([asg("2026-11-01", "2026-11-10T08:00:00Z")], [], "Compliant", [], False, 0, 0, None),
        # due 2026-11-11, open -> 21 - 11 = 10 days overdue
        ([asg("2026-11-11")], [], "Non-compliant", ["OverdueTraining"], False, 10, 0, None),
        # two overdue: 10 and 51 days (2026-10-01 -> 2026-11-21 = 30 + 21) -> max 51
        ([asg("2026-11-11"), asg("2026-10-01")], [], "Non-compliant", ["OverdueTraining"], False, 51, 0, None),
        # Missing flag -> Non-compliant, no day count
        ([], [flag("Missing")], "Non-compliant", ["CertificateMissing"], False, 0, 0, None),
        # Expired on 2026-10-22 -> 9 (rest of Oct) + 21 = 30 days expired
        ([], [flag("Expired", "2026-10-22")], "Non-compliant", ["CertificateExpired"], False, 0, 30, None),
        # resolved flag is ignored
        ([], [flag("Missing", status="resolved")], "Compliant", [], False, 0, 0, None),
        # expiring soon stays Compliant, soonest of two dates wins
        ([], [flag("ExpiringSoon", "2026-12-10"), flag("ExpiringSoon", "2026-12-01")],
         "Compliant", [], True, 0, 0, "2026-12-01"),
        # two reasons at once: overdue (10 days) + missing; reasons come in fixed order
        ([asg("2026-11-11")], [flag("Missing")],
         "Non-compliant", ["OverdueTraining", "CertificateMissing"], False, 10, 0, None),
        # all three reasons + expiring soon on another cert: still Non-compliant, expiringSoon kept for info
        ([asg("2026-11-20")], [flag("Expired", "2026-11-01"), flag("Missing"), flag("ExpiringSoon", "2026-12-01")],
         "Non-compliant", ["OverdueTraining", "CertificateMissing", "CertificateExpired"], True, 1, 20, "2026-12-01"),
    ],
)
def test_evaluate_employee(assignments, flags, status, reasons, expiring, overdue_days, expired_days, soonest):
    result = evaluate_employee(assignments, flags, TODAY)
    assert result == {
        "status": status,
        "reasons": reasons,
        "expiringSoon": expiring,
        "daysOverdueMax": overdue_days,
        "daysExpiredMax": expired_days,
        "soonestExpiry": soonest,
    }


# ---------- compliance_rate ----------

def rows_with(compliant, non_compliant):
    return [{"status": "Compliant"}] * compliant + [{"status": "Non-compliant"}] * non_compliant


# EN: Rate = compliant / all x 100, 1 decimal. Empty team must return 0, not crash.
# Franco: El nesba = compliant / el kol x 100, rakam 3ashari wa7ed. Team fady lazem yerga3 0 mesh yewa22a3.
@pytest.mark.parametrize("compliant, non_compliant, expected", [
    (0, 0, 0.0),     # empty team
    (3, 0, 100.0),
    (0, 4, 0.0),
    (1, 2, 33.3),    # 33.333...
    (2, 1, 66.7),    # 66.666...
    (1, 7, 12.5),
])
def test_compliance_rate(compliant, non_compliant, expected):
    assert compliance_rate(rows_with(compliant, non_compliant)) == expected


# ---------- attention_order ----------

def row(emp, status, overdue=0, expired=0, soonest=None):
    return {"employeeId": emp, "status": status, "daysOverdueMax": overdue, "daysExpiredMax": expired,
            "expiringSoon": soonest is not None, "soonestExpiry": soonest}


def test_attention_order_ranking():
    rows = [
        row("ok", "Compliant"),                                # fully OK -> left out
        row("soon-late", "Compliant", soonest="2026-12-15"),
        row("missing", "Non-compliant"),                       # 0 days -> last of the non-compliant
        row("overdue5", "Non-compliant", overdue=5),
        row("expired40", "Non-compliant", expired=40),
        row("soon-early", "Compliant", soonest="2026-11-25"),
        row("both", "Non-compliant", overdue=12, expired=3),   # ranked by the bigger number (12)
    ]
    order = [r["employeeId"] for r in attention_order(rows)]
    assert order == ["expired40", "both", "overdue5", "missing", "soon-early", "soon-late"]


# EN: Ties keep a stable order by employeeId, whatever the input order is.
# Franco: Law fi ta3adol, el tarteeb beyfdal sabet bel employeeId mahma kan tarteeb el input.
def test_attention_order_ties_sorted_by_employee_id():
    rows = [
        row("e3", "Non-compliant", overdue=7),
        row("e1", "Non-compliant", expired=7),
        row("e9", "Compliant", soonest="2026-12-01"),
        row("e2", "Compliant", soonest="2026-12-01"),
    ]
    order = [r["employeeId"] for r in attention_order(rows)]
    assert order == ["e1", "e3", "e2", "e9"]


def test_attention_order_empty_team():
    assert attention_order([]) == []


# ---------- whole team from mocked S1/S2 fixtures ----------
# EN: Hand calculation for the fixture team (today 2026-11-21):
#     e1 Alice  completed on time + future due           -> Compliant
#     e2 Bob    due today, open                          -> Compliant
#     e3 Carol  completed late + cert expiring 2026-12-05 -> Compliant, expiring soon
#     e4 Dan    Safety due 2026-11-11 open (10 days) + Privacy cert Missing -> Non-compliant, 2 reasons
#     e5 Eve    Privacy cert expired 2026-10-22 (30 days) -> Non-compliant
#     e6 Frank  Missing flag resolved + cert expiring 2026-11-30 -> Compliant, expiring soon
#     Rate = 4 / 6 = 66.7. Attention = e5 (30), e4 (10), e6 (11-30), e3 (12-05).
# Franco: 7esab b-eedena lel team elly fel fixtures; el nesba 4/6 = 66.7 w el attention e5, e4, e6, e3.

@pytest.fixture
def team():
    return load("s1_employees.json"), load("s1_assignments.json"), load("s2_compliance.json")["flags"]


def test_team_from_fixtures(team):
    employees, assignments, flags = team
    rows = evaluate_team(employees, assignments, flags, TODAY)
    by_id = {r["employeeId"]: r for r in rows}

    assert [r["employeeId"] for r in rows] == ["e1", "e2", "e3", "e4", "e5", "e6"]
    assert by_id["e1"]["status"] == "Compliant"
    assert by_id["e2"]["status"] == "Compliant"
    assert by_id["e3"]["status"] == "Compliant" and by_id["e3"]["soonestExpiry"] == "2026-12-05"
    assert by_id["e4"]["reasons"] == ["OverdueTraining", "CertificateMissing"]
    assert by_id["e4"]["daysOverdueMax"] == 10
    assert by_id["e5"]["reasons"] == ["CertificateExpired"] and by_id["e5"]["daysExpiredMax"] == 30
    assert by_id["e6"]["status"] == "Compliant" and by_id["e6"]["soonestExpiry"] == "2026-11-30"

    assert compliance_rate(rows) == 66.7
    assert [r["employeeId"] for r in attention_order(rows)] == ["e5", "e4", "e6", "e3"]


# EN: Category rate looks only at that category's assignments/flags.
#     Safety: only e4 is overdue -> 5/6 = 83.3. Privacy: e4 Missing + e5 Expired -> 4/6 = 66.7, and e4's reason
#     is only CertificateMissing (his overdue item is Safety). Unknown category -> everyone Compliant -> 100.0.
# Franco: Nesbet el category betbos 3ala assignments/flags el category di bas.
@pytest.mark.parametrize("category, rate, e4_reasons", [
    ("Safety", 83.3, ["OverdueTraining"]),
    ("Privacy", 66.7, ["CertificateMissing"]),
    ("Nonexistent", 100.0, []),
])
def test_team_by_category(team, category, rate, e4_reasons):
    employees, assignments, flags = team
    rows = evaluate_team(employees, assignments, flags, TODAY, category=category)
    assert compliance_rate(rows) == rate
    assert next(r for r in rows if r["employeeId"] == "e4")["reasons"] == e4_reasons


def test_empty_team():
    rows = evaluate_team([], [], [], TODAY)
    assert rows == []
    assert compliance_rate(rows) == 0.0
    assert attention_order(rows) == []
