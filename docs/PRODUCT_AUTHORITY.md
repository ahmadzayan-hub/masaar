# Product Authority — Masaar

## Primary User

The person running a small commerce operation end to end: taking the
enquiry, quoting it, chasing the payment, releasing it to the workshop,
and answering the customer when they ask where it is. Usually one or two
people wearing five roles.

## Job To Be Done

Move every order from first contact to delivered without anything falling
through — and know, at any moment, which orders are stuck and whose move
it is next.

## System of Record

Orders and their full lifecycle, customers, payments, delivery, the
transition history of every order, and the append-only audit log. If it
happened to an order, Masaar is where it is written down.

## System of Intelligence

Pipeline state — what is stuck, where, and for how long — and which
action each role is allowed to take next on a given order.

## Primary Workflow

```
lead → qualified → confirmed → paid → design_approval
    → production → qc → dispatched → delivered → after_sales
```

Cancellation is a transition, not a deletion. Every move is checked
against `order_transitions`: the from-state, the to-state, and the roles
permitted to make it. A move nobody is allowed to make cannot be made.

## Human Decision Boundary

- **The state machine is enforced in the database, not in the UI.** A
  trigger guards `orders.status`; the application cannot move an order by
  writing to it directly, and neither can anything else with a connection
  string.
- Five roles — Owner, Operator, Finance, Workshop, Read-only — and RLS
  scopes reads by role, not by convention.
- Consequential actions are **not optimistic**. Financial approval and
  manufacturing release wait for the server to confirm before the screen
  changes, because a UI that shows "paid" before the row says so is
  lying at exactly the wrong moment.
- `audit_logs` is append-only. An audit trail that can be rewritten is
  not an audit trail.

## Measurable Outcome

**North star:** orders delivered without an unexplained stall.

Supporting: time in each stage, orders stuck past their stage's normal
dwell, share of transitions made by the role that should own them,
payment-to-release lag.

## Explicit Non-Goals

- Not a jewellery design engine → **Beyond Style (`66`)**
- Not a document-understanding product → **Mutabasir**
- Not a contract-compliance product → **VERTEX**
- Not a learning platform → **Maktab**
- Not a general ERP, and not an accounting system

## External Systems

- **Supabase** — Postgres, Auth, RLS. The system of record.
- **Google Sheets** — a write sink for operators who still live in a sheet.
- **WhatsApp webhook** — inbound customer messages.
- `domain_events` is an outbox: `order.paid`, `order.dispatched`,
  `order.delivered`, `order.cancelled` and the rest are published for
  other systems to consume, so nothing else needs to poll the orders
  table.

## Data Ownership

Masaar owns orders, customers, payments, delivery records, order events
and the audit log. Other products read them through APIs or the event
outbox — never by querying these tables, and never by writing to them.

## Canonical Repository

`github.com/ahmadzayan-hub/masaar` · branch `main`

## Production Deployment

Vercel project `masaar`.

## Known limitation — read this before calling it production-ready

Migration `0006_rbac_lifecycle.sql` — RBAC, role-scoped RLS, the enforced
state machine, `order_events`, `domain_events` and the append-only audit
log — **has not been applied.** The Supabase project `beyond-style` is
INACTIVE.

Everything described above under "Human Decision Boundary" exists in this
repository and not in the database. Until that migration runs, the
guarantees are documentation, not enforcement. This is the single
highest-value unblocking action in the portfolio.
