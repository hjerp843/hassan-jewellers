# Hassan Jewellers Gold Management ERP — Master Document

> **Save this file at:** `A:\projects\hassan_jewellers\PROJECT_MASTER_DOCUMENT.md`
> **Also committed to:** https://github.com/hjerp843/hassan-jewellers.git
> **Last updated:** June 2026 — post handoff, owner testing phase

---

## 1. Project Overview

A full-stack gold management ERP system built for Hassan Jewellers. Tracks every ornament from the moment a customer walks in to the moment it is returned, melted into refined stock, or repaired and delivered.

---

## 2. Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TailwindCSS + React Router DOM |
| Backend | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Hosting | Local / Vite dev server (production deployment TBD) |

**Supabase project details**
- Project ID: `oqzwfmpbuttocfrffqam`
- Region: `ap-southeast-2` (Sydney)
- Supabase account: `salmuk301@gmail.com`

**Frontend project path**
```
A:\projects\hassan_jewellers\frontend
```

---

## 3. User Accounts

| Role | Name | Email | UUID |
|------|------|-------|------|
| Owner | Mohammed Salman | mohammedsalmanap@gmail.com | `497a115e-7ffc-4589-9a52-a98e35516a60` |
| Staff | Hassan | hassansadi@gmail.com | `c01a5a1d-acaf-44fa-9f71-001bfc0e1004` |

---

## 4. Key Files

```
src/
  App.jsx                    — routes + ProtectedRoute (ownerOnly)
  supabaseClient.js          — Supabase URL + anon key
  context/AuthContext.jsx    — useAuth() → user / profile / loading
  components/Navbar.jsx      — staff + owner nav links
  components/ProtectedRoute.jsx — ownerOnly redirects to /gold-intake
  constants/statuses.js      — ASSET_STATUS, BATCH_STATUS, STOCK_STATUS, DISPOSITION
  services/dashboardMetrics.js — getInventoryMetrics(), getMeltingMetrics(), getStockMetrics()
  pages/
    Login.jsx
    Dashboard.jsx            — owner only
    GoldRates.jsx            — owner only
    Customers.jsx
    GoldIntake.jsx
    Repair.jsx
    PurityTest.jsx
    MeltingBatch.jsx         — owner only
    Inventory.jsx            — owner only
    Outcomes.jsx             — NOT YET BUILT
schema.sql                   — complete database rebuild file (repo root)
PROJECT_MASTER_DOCUMENT.md   — this file (repo root)
```

**Navigation order**
- Staff: Customers → Gold Intake → Repair → Purity Test
- Owner adds: Dashboard, Gold Rates (top) + Melting, Inventory, Outcomes (bottom)

---

## 5. Database

### 5.1 Tables (13 actual tables)

| Table | Purpose |
|-------|---------|
| users | mirrors auth.users; id = auth.uid() |
| customers | customer master with soft deactivation |
| intake_headers | one row per customer visit/drop-off |
| intake_items | one row per ornament — the ASSET, single source of truth |
| purity_tests | XRF multi-metal composition test per asset |
| melting_batches | groups assets to be melted together (owner-only) |
| melting_batch_items | assets inside a batch |
| stock | refined gold produced from completed batches |
| vendors | external repair vendors (never hard-deleted) |
| repairs | one active repair job per asset |
| repair_tasks | multiple tasks per repair, each inhouse or vendor |
| audit_log | every significant action across all modules |
| gold_rates | daily/spot gold rates for valuation |

> **Note:** `inventory_snapshots` was planned but never created. Do not reference it anywhere.

### 5.2 Sequences and Code Formats

| Sequence | Format | Example |
|----------|--------|---------|
| customer_code_seq | CUST-000001 | CUST-000001 |
| asset_code_seq | AST-000001 | AST-000001 |
| batch_code_seq | MB-000001 | MB-000001 |
| stock_code_seq | STK-000001 | STK-000001 |
| repair_code_seq | REP-000001 | REP-000001 |

### 5.3 Asset Status Lifecycle (intake_items.status)

`intake_items.status` is the single source of truth for where every asset is at all times.

```
received
  ↓
tested
  ↓ (disposition = melt)          ↓ (disposition = repair)
batched                        repair_pending
  ↓                              ↓
melted                         repair_inprogress
  ↓                              ↓
stocked                        repair_qualitycheck
                                 ↓
                               repair_ready
                                 ↓ (if purity_test_required)
                               repair_waiting_purity
                                 ↓
returned         ←  delivered repair / returned directly
cancelled        ←  cancelled at any stage
```

> `repair_delivered` was intentionally dropped. Delivered repairs set asset status to `returned`.

### 5.4 Key Formulas

| Calculation | Formula |
|-------------|---------|
| Karat | gold_percent / 100 × 24 |
| Pure gold weight | net_weight × gold_percent / 100 |
| Recoverable gold | actual_melted_weight × (batch_gold_percent / 100) |
| Recovery % | recoverable_gold / total_expected_gold × 100 |
| Repair profit | amount_collected − vendor_cost − material_cost |
| Inventory health | 100 − (stale_assets × 5) − (completed_awaiting_stock × 10) − (open_batches > 3 ? 10 : 0) |
| Reconciliation | customer_assets_weight + refined_stock_weight = total_controlled_gold |

---

## 6. Modules

### 6.1 Customers
- Add / edit / soft deactivate (with reason) / reactivate (with reason)
- Phone: exactly 10 digits, validated frontend `/^[0-9]{10}$/`
- Duplicate phone detection
- customer_code auto-assigned from sequence

### 6.2 Gold Intake
- Staff creates intake header (one per visit) then adds items
- Each item: ornament type, weights (gross/stone/dust/net), estimated purity, disposition
- Dispositions: melt / resale / exchange / return / repair / polish
- asset_code auto-assigned from sequence
- Staff: create + remove (with reason). Owner: edit + edit date (all audited)

### 6.3 Purity Test
- XRF multi-metal: gold%, silver%, copper%, cadmium%, other_metals% (each numeric 6,3)
- Total composition must sum to ~100% (green 99.5–100.5%, yellow 99–100.51%, red outside)
- Unique partial index: one active test per asset (where cancellation_reason is null)
- Variance vs estimated_purity → NORMAL / CHECK / HIGH VARIANCE labels
- Staff: create + cancel. Owner: create + edit + cancel (all audited)

### 6.4 Melting Batch (owner-only)
- Ready queue: assets with status=tested AND disposition=melt
- Multi-select assets → create batch → complete with actual weight + post-melt composition
- stock_created flag prevents duplicate stock records
- Asset flow on batch completion: tested → batched → melted → stocked

### 6.5 Inventory (owner-only)
- Summary cards + health score
- Alerts (critical / warning / info)
- Inventory flow pipeline
- Asset aging analysis
- Operational queue
- Global traceability search: customer→assets, batch→assets→customers, stock→batch
- Customer asset inventory, melting inventory, refined gold inventory
- Reconciliation: customerAssets + refinedStock = totalControlled
- Valuation via gold_rates table (rate_per_gram, rate_date)

### 6.6 Repair
- Repair queue auto-populated from intake_items where disposition=repair and no active repair exists
- `original_asset_status` stored at repair creation → used to revert asset on cancellation
- Multi-task jobs: each task independently inhouse or vendor
- SLA auto-dates: low=10d, normal=7d, high=3d, urgent=1d
- Promise date tracked separately from expected completion date
- QC checklist (5 items): all must pass before Ready for Delivery
- If `purity_test_required=true`: QC completion sets asset to `repair_waiting_purity` (not `repair_ready`)
- Status flow: pending → assigned → inprogress → qualitycheck → readyfordelivery → delivered
- Validations: assigned requires ≥1 task; qualitycheck requires all tasks completed; readyfordelivery requires all 5 QC
- Delivery: records amount collected, payment method, auto-computes profit, sets asset→returned
- Additional cost: owner-only, mandatory reason
- Vendor management (owner-only): add/edit/deactivate with reason/reactivate, active+inactive tabs, search, spec filter
- Vendor analytics: jobs/completed/active/avg turnaround/late/on-time%/total cost
- Repair timeline from audit_log entries
- Customer repair history: client-side filter (nested .eq() on relationships does not work in Supabase)
- ASSET_STATUS_MAP: pending/assigned→repair_pending, inprogress→repair_inprogress, qualitycheck→repair_qualitycheck, readyfordelivery→repair_ready, delivered→returned

---

## 7. Permissions Model

### Role definitions
- `is_owner()` — SECURITY DEFINER function, checks users.role = 'owner'
- `is_staff()` — SECURITY DEFINER function, checks users.role in ('owner', 'staff')
- Both use SECURITY DEFINER to prevent RLS recursion

### ProtectedRoute
```jsx
if (ownerOnly && profile?.role !== 'owner') {
  return <Navigate to="/gold-intake" replace />
}
```

### RLS pattern per table
| Operation | Who |
|-----------|-----|
| SELECT | auth.role() = 'authenticated' |
| INSERT | authenticated (shared modules) or is_owner() (owner-only modules) |
| UPDATE | authenticated (shared modules) or is_owner() (owner-only modules) |
| DELETE | is_owner() (all tables) |

> **Critical:** DELETE requires BOTH an RLS policy (`using (is_owner())`) AND a table grant (`grant delete on public.TABLE to authenticated`). Missing either causes "permission denied".

---

## 8. Audit Trail

Every significant action logs to `audit_log`:

| Column | Description |
|--------|-------------|
| changed_by | user UUID |
| changed_by_name | user full_name (denormalised for display) |
| table_name | which table was affected |
| record_id | UUID of the changed record |
| field_name | what changed (e.g. status_changed, repair_created) |
| old_value | previous value (JSON string) |
| new_value | new value (JSON string) |
| changed_at | timestamp |

---

## 9. Current Status

| Item | Status |
|------|--------|
| Customers module | ✅ Complete |
| Gold Intake module | ✅ Complete |
| Purity Test module | ✅ Complete |
| Melting Batch module | ✅ Complete |
| Inventory module | ✅ Complete |
| Repair module | ✅ Complete |
| Production DB reset | ✅ Done — clean slate for owner |
| GitHub backup | ✅ Done |
| schema.sql | ✅ In repo |
| Outcomes module | ❌ Not started — next after feedback |
| Audit Log Viewer | ❌ Not started |
| Dashboard Analytics | ❌ Not started |
| Reports / Export | ❌ Not started |
| Backup system (manual + auto) | ❌ Not started |
| Global Search | ❌ Not started |
| Daily Closing | ❌ Not started |
| Notifications | ❌ Not started |

**Next module:** Outcomes — tracks gold and money leaving the system (repair revenue, returns, stock consumed, sales). This is the critical missing piece: gold enters the system ✅ but does not yet formally exit ❌.

---

## 10. Backup & Recovery

### Layer 1 — GitHub (Source Code)
- **Repository:** https://github.com/hjerp843/hassan-jewellers.git (private)
- Contains all 38 source files + schema.sql + this document
- Primary source of truth for application code

```bash
git clone https://github.com/hjerp843/hassan-jewellers.git
```

### Layer 2 — schema.sql (Database Blueprint)
Single file in repo root that rebuilds the entire database:
- pgcrypto extension
- All 5 sequences
- All 13 tables with full column definitions, constraints, check values
- Unique indexes (unique_active_purity_test, unique_active_batch_item, unique_active_repair)
- is_owner() and is_staff() SECURITY DEFINER functions
- RLS enabled on all 13 tables
- 47 RLS policies
- 11 table-level DELETE grants to authenticated role
- Seed data: 2 users + 5 default vendors
- Production reset script (commented out)

### Layer 3 — Recovery Documentation & AI-Assisted Knowledge
Architecture decisions, workflow rules, business logic, status enums, RLS patterns, known Supabase issues, and troubleshooting history are documented here and in Claude's conversation memory. This assists reconstruction and debugging but **does not replace GitHub and schema.sql as the primary backups.**

---

## 11. Full Rebuild Procedure

1. Create a new Supabase project
2. In Supabase Auth dashboard, create owner account: `mohammedsalmanap@gmail.com`
3. Create staff account: `hassansadi@gmail.com` (Hassan)
4. Note the UUIDs Supabase generates for both accounts
5. Clone the repository:
   ```bash
   git clone https://github.com/hjerp843/hassan-jewellers.git
   ```
6. Open `schema.sql`, find section 8.1 (SEED DATA), update the two UUIDs to match the new auth accounts
7. Run `schema.sql` as **postgres superuser** in Supabase SQL Editor
8. Open `src/supabaseClient.js`, update the Supabase project URL and anon key
9. Install and run:
   ```bash
   npm install
   npm run dev
   ```
10. System fully restored

---

## 12. Database Reset Script

Run as **postgres superuser** when handing a clean database to the owner.
Truncates all transactional data. Keeps users, vendors, gold_rates.

```sql
truncate table repair_tasks        cascade;
truncate table repairs             cascade;
truncate table melting_batch_items cascade;
truncate table melting_batches     cascade;
truncate table stock               cascade;
truncate table purity_tests        cascade;
truncate table intake_items        cascade;
truncate table intake_headers      cascade;
truncate table customers           cascade;
truncate table audit_log           cascade;

select setval('customer_code_seq', 1, false);
select setval('asset_code_seq',    1, false);
select setval('batch_code_seq',    1, false);
select setval('repair_code_seq',   1, false);
select setval('stock_code_seq',    1, false);
```

> `inventory_snapshots` does not exist — never include it in reset scripts.

---

## 13. Known Supabase Issues & Lessons

| Issue | Solution |
|-------|----------|
| Permission denied on DELETE | Add BOTH RLS DELETE policy AND `grant delete on public.TABLE to authenticated` |
| RLS recursion on is_owner() / is_staff() | Use SECURITY DEFINER on both functions |
| Nested relationship filter fails | `.eq('intake_headers.customers.id', id)` does not work — fetch and filter client-side |
| Admin queries fail as authenticated | Switch SQL Editor role to postgres (Superuser) |
| inventory_snapshots does not exist | Table was planned but never created — do not reference it |
| Truncate fails on authenticated role | Always run reset script as postgres superuser |

---

## 14. GitHub Update Procedure

After any code change:

```bash
git add .
git commit -m "describe what changed"
git push
```

---

*With the GitHub repository, schema.sql, and this document, the Hassan Jewellers ERP system is fully recoverable and rebuildable from scratch.*
