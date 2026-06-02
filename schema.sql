-- ============================================================================
-- HASSAN JEWELLERS GOLD MANAGEMENT ERP — COMPLETE DATABASE SCHEMA
-- ----------------------------------------------------------------------------
-- Stack:    React + Vite + TailwindCSS + React Router DOM + Supabase (Postgres)
-- Region:   ap-southeast-2 (Sydney)
-- Run as:   postgres (Superuser) in Supabase SQL Editor
-- Purpose:  Rebuild the entire database from scratch — tables, sequences,
--           indexes, RLS helpers, policies, grants, and seed data.
--
-- IMPORTANT EXECUTION NOTES
--   * Run this whole file once on a fresh Supabase project.
--   * The auth.users table is managed by Supabase Auth. The public.users
--     table below mirrors it (id should equal auth.uid()). Create the owner
--     and staff auth accounts in the Supabase Auth dashboard first, then
--     insert matching rows into public.users (see SEED DATA at the bottom).
--   * Owner UUID:  497a115e-7ffc-4589-9a52-a98e35516a60  (mohammedsalmanap@gmail.com)
--   * Staff  UUID: 2d675c44-433c-40c6-bd13-206113f5515c  (salmuk301@gmail.com / Irfan Ahmed)
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto";   -- for gen_random_uuid()


-- ============================================================================
-- 2. SEQUENCES  (human-readable codes)
-- ============================================================================
create sequence if not exists customer_code_seq start 1;
create sequence if not exists asset_code_seq    start 1;
create sequence if not exists batch_code_seq    start 1;
create sequence if not exists stock_code_seq    start 1;
create sequence if not exists repair_code_seq   start 1;


-- ============================================================================
-- 3. TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 3.1 users  (mirrors auth.users; id = auth.uid())
-- ----------------------------------------------------------------------------
create table if not exists users (
  id         uuid primary key,                  -- equals auth.uid()
  email      text unique not null,
  full_name  text,
  role       text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamp default now()
);

-- ----------------------------------------------------------------------------
-- 3.2 customers
-- ----------------------------------------------------------------------------
create table if not exists customers (
  id                  uuid primary key default gen_random_uuid(),
  customer_code       text unique not null
                        default ('CUST-' || lpad(nextval('customer_code_seq')::text, 6, '0')),
  full_name           text not null,
  phone               text,                       -- 10-digit, validated in UI: /^[0-9]{10}$/
  address             text,
  notes               text,
  is_active           boolean default true,
  created_by          uuid references users(id),
  deactivated_by      uuid references users(id),
  deactivation_reason text,
  reactivated_by      uuid references users(id),
  reactivation_reason text,
  created_at          timestamp default now(),
  updated_at          timestamp
);

-- ----------------------------------------------------------------------------
-- 3.3 gold_rates  (master data — daily/spot rates used for valuation)
-- ----------------------------------------------------------------------------
create table if not exists gold_rates (
  id            uuid primary key default gen_random_uuid(),
  set_by        uuid references users(id),
  rate_date     date not null,
  rate_per_gram numeric(10,2) not null,
  rate_type     text,                             -- e.g. 22K, 24K, spot
  created_at    timestamp default now()
);

-- ----------------------------------------------------------------------------
-- 3.4 vendors  (master data — external repair vendors; never hard-deleted)
-- ----------------------------------------------------------------------------
create table if not exists vendors (
  id              uuid primary key default gen_random_uuid(),
  vendor_name     text not null,
  phone           text,                           -- 10-digit, UI validated
  alternate_phone text,
  address         text,
  specialization  text,
  notes           text,                           -- on deactivation: "Deactivated: <reason>"
  is_active       boolean default true,
  created_by      uuid references users(id),
  created_at      timestamp default now(),
  updated_at      timestamp
);

-- ----------------------------------------------------------------------------
-- 3.5 intake_headers  (a customer visit / drop-off)
-- ----------------------------------------------------------------------------
create table if not exists intake_headers (
  id         uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  staff_id   uuid references users(id),
  visit_date date not null default current_date,
  status     text not null default 'open'
               check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  created_at timestamp default now()
);

-- ----------------------------------------------------------------------------
-- 3.6 intake_items  (individual ornaments — the ASSET; single source of truth
--      for asset location/status throughout its entire lifecycle)
-- ----------------------------------------------------------------------------
create table if not exists intake_items (
  id                  uuid primary key default gen_random_uuid(),
  intake_header_id    uuid references intake_headers(id),
  asset_code          text unique not null
                        default ('AST-' || lpad(nextval('asset_code_seq')::text, 6, '0')),
  ornament_type       text,
  gross_weight        numeric(12,3),
  stone_weight        numeric(12,3),
  dust_weight         numeric(12,3),
  net_weight          numeric(12,3),
  estimated_purity    numeric(6,3),
  disposition         text check (disposition in
                        ('melt', 'resale', 'exchange', 'return', 'repair', 'polish')),
  status              text not null default 'received'
                        check (status in (
                          'received', 'tested', 'batched', 'melted', 'stocked',
                          'returned', 'cancelled',
                          'repair_pending', 'repair_inprogress', 'repair_qualitycheck',
                          'repair_ready', 'repair_waiting_purity'
                        )),
  remarks             text,
  cancelled_by        uuid references users(id),
  cancellation_reason text,
  created_at          timestamp default now(),
  updated_at          timestamp
);
-- NOTE: 'repair_delivered' was intentionally DROPPED — a delivered repair sets
--       the asset status back to 'returned'. Repair history lives in repairs table.

-- ----------------------------------------------------------------------------
-- 3.7 purity_tests  (XRF multi-metal composition test per asset)
-- ----------------------------------------------------------------------------
create table if not exists purity_tests (
  id                    uuid primary key default gen_random_uuid(),
  intake_item_id        uuid references intake_items(id),
  tested_by             uuid references users(id),
  tested_purity         numeric(6,3),
  gold_percent          numeric(6,3),
  silver_percent        numeric(6,3),
  copper_percent        numeric(6,3),
  cadmium_percent       numeric(6,3),
  other_metals_percent  numeric(6,3),
  pure_gold_weight      numeric(12,3),     -- = net_weight * gold_percent / 100
  estimated_purity      numeric(6,3),
  test_date             date default current_date,
  notes                 text,
  cancelled_by          uuid references users(id),
  cancellation_reason   text,
  created_at            timestamp default now(),
  updated_at            timestamp
);
-- Karat = gold_percent / 100 * 24
-- Composition validity: green 99.5-100.5%, yellow 99-100.51, red outside.
-- Variance labels NORMAL / CHECK / HIGH VARIANCE vs estimated_purity.
create unique index if not exists unique_active_purity_test
  on purity_tests(intake_item_id)
  where cancellation_reason is null;

-- ----------------------------------------------------------------------------
-- 3.8 melting_batches  (owner-only; groups tested+melt assets to refine)
-- ----------------------------------------------------------------------------
create table if not exists melting_batches (
  id                    uuid primary key default gen_random_uuid(),
  batch_code            text unique not null
                          default ('MB-' || lpad(nextval('batch_code_seq')::text, 6, '0')),
  status                text not null default 'open'
                          check (status in ('open', 'completed', 'cancelled')),
  created_by            uuid references users(id),
  completed_by          uuid references users(id),
  total_expected_gold   numeric(12,3),
  expected_total_weight numeric(12,3),
  actual_melted_weight  numeric(12,3),
  wastage_weight        numeric(12,3),
  recovery_percentage   numeric(6,3),
  actual_recoverable_gold numeric(12,3),
  batch_gold_percent    numeric(6,3),
  batch_silver_percent  numeric(6,3),
  batch_copper_percent  numeric(6,3),
  batch_cadmium_percent numeric(6,3),
  batch_other_percent   numeric(6,3),
  asset_count           integer,
  stock_created         boolean default false,
  cancelled_by          uuid references users(id),
  cancelled_at          timestamp,
  cancellation_reason   text,
  notes                 text,
  created_at            timestamp default now(),
  updated_at            timestamp
);
-- recoverableGold = actual_melted_weight * (batch_gold_percent / 100)
-- recovery_percentage = recoverableGold / total_expected_gold * 100

-- ----------------------------------------------------------------------------
-- 3.9 melting_batch_items  (assets inside a batch)
-- ----------------------------------------------------------------------------
create table if not exists melting_batch_items (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid references melting_batches(id) on delete cascade,
  intake_item_id   uuid references intake_items(id),
  purity_test_id   uuid references purity_tests(id),
  pure_gold_weight numeric(12,3),
  added_by         uuid references users(id),
  created_at       timestamp default now()
);
create unique index if not exists unique_active_batch_item
  on melting_batch_items(intake_item_id);

-- ----------------------------------------------------------------------------
-- 3.10 stock  (refined gold produced from completed melting batches)
-- ----------------------------------------------------------------------------
create table if not exists stock (
  id               uuid primary key default gen_random_uuid(),
  stock_code       text unique not null
                     default ('STK-' || lpad(nextval('stock_code_seq')::text, 6, '0')),
  batch_id         uuid references melting_batches(id),
  weight           numeric(12,3),
  gold_percent     numeric(6,3),
  recoverable_gold numeric(12,3),
  karat            numeric(5,2),
  status           text not null default 'available'
                     check (status in ('available', 'reserved', 'used', 'consumed', 'cancelled')),
  source_batch_code text,
  total_assets     integer,
  remaining_weight numeric(12,3),
  reserved_weight  numeric(12,3) default 0,
  consumed_weight  numeric(12,3) default 0,
  notes            text,
  created_by       uuid references users(id),
  created_at       timestamp default now(),
  updated_at       timestamp
);

-- ----------------------------------------------------------------------------
-- 3.11 repairs  (one active repair per asset)
-- ----------------------------------------------------------------------------
create table if not exists repairs (
  id                    uuid primary key default gen_random_uuid(),
  repair_code           text unique not null
                          default ('REP-' || lpad(nextval('repair_code_seq')::text, 6, '0')),
  intake_item_id        uuid references intake_items(id),
  customer_id           uuid references customers(id),
  original_asset_status text,             -- CRITICAL: set on create = creatingForItem.status;
                                          -- on cancel revert asset to this (|| 'tested')
  priority              text not null default 'normal'
                          check (priority in ('low', 'normal', 'high', 'urgent')),
  purity_test_required  boolean default false,
  status                text not null default 'pending'
                          check (status in ('pending', 'assigned', 'inprogress',
                            'qualitycheck', 'readyfordelivery', 'delivered', 'cancelled')),
  expected_completion_date date,          -- auto from SLA: low=10 normal=7 high=3 urgent=1
  promised_date         date,             -- date promised to customer (may differ)
  -- QC checklist (all 5 must pass before Ready for Delivery)
  qc_repair_complete       boolean default false,
  qc_polish_complete       boolean default false,
  qc_stone_secure          boolean default false,
  qc_weight_verified       boolean default false,
  qc_customer_request_done boolean default false,
  -- Costing
  estimated_cost        numeric(10,2) default 0,
  additional_cost       numeric(10,2) default 0,
  additional_cost_reason text,
  final_cost            numeric(10,2) default 0,   -- estimated + additional
  -- Revenue / delivery
  payment_received      boolean default false,
  repair_revenue        numeric(10,2) default 0,
  profit                numeric(10,2) default 0,   -- amount_collected - vendor_cost - material_cost
  delivered_at          timestamp,
  delivered_by          uuid references users(id),
  amount_collected      numeric(10,2),
  payment_method        text check (payment_method in ('cash', 'upi', 'card', 'bank_transfer')),
  delivery_notes        text,
  -- Cancellation
  cancellation_reason   text,
  cancelled_by          uuid references users(id),
  cancelled_at          timestamp,
  -- Meta
  created_by            uuid references users(id),
  updated_by            uuid references users(id),
  created_at            timestamp default now(),
  updated_at            timestamp
);
create unique index if not exists unique_active_repair
  on repairs(intake_item_id)
  where status not in ('delivered', 'cancelled');

-- ----------------------------------------------------------------------------
-- 3.12 repair_tasks  (many tasks per repair; each independently in-house/vendor)
-- ----------------------------------------------------------------------------
create table if not exists repair_tasks (
  id                    uuid primary key default gen_random_uuid(),
  repair_id             uuid references repairs(id) on delete cascade,
  repair_type           text not null,
  description           text,
  responsibility        text not null default 'inhouse'
                          check (responsibility in ('inhouse', 'vendor')),
  vendor_id             uuid references vendors(id),
  assigned_to           uuid references users(id),
  vendor_sent_date      date,
  vendor_expected_return date,
  vendor_actual_return  date,
  task_status           text not null default 'pending'
                          check (task_status in ('pending', 'inprogress', 'completed', 'cancelled')),
  labour_cost           numeric(10,2) default 0,
  material_cost         numeric(10,2) default 0,
  vendor_cost           numeric(10,2) default 0,
  notes                 text,
  created_at            timestamp default now(),
  updated_at            timestamp
);

-- ----------------------------------------------------------------------------
-- 3.13 audit_log  (every important action across all modules)
-- ----------------------------------------------------------------------------
create table if not exists audit_log (
  id              uuid primary key default gen_random_uuid(),
  changed_by      uuid references users(id),
  changed_by_name text,
  table_name      text,
  record_id       uuid,
  field_name      text,
  old_value       text,
  new_value       text,
  changed_at      timestamp default now()
);

-- NOTE: inventory_snapshots was PLANNED but never created. Inventory.jsx works
--       without it. If you later add nightly snapshots, create it then.


-- ============================================================================
-- 4. RLS HELPER FUNCTIONS  (SECURITY DEFINER — prevents RLS recursion)
-- ============================================================================
create or replace function is_owner()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where users.id = auth.uid() and users.role = 'owner'
  );
$$;

create or replace function is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where users.id = auth.uid() and users.role in ('owner', 'staff')
  );
$$;


-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================
alter table users               enable row level security;
alter table customers           enable row level security;
alter table gold_rates          enable row level security;
alter table vendors             enable row level security;
alter table intake_headers      enable row level security;
alter table intake_items        enable row level security;
alter table purity_tests        enable row level security;
alter table melting_batches     enable row level security;
alter table melting_batch_items enable row level security;
alter table stock               enable row level security;
alter table repairs             enable row level security;
alter table repair_tasks        enable row level security;
alter table audit_log           enable row level security;


-- ============================================================================
-- 6. RLS POLICIES
--   General pattern:
--     * SELECT: any authenticated user
--     * INSERT/UPDATE: authenticated for shared modules; is_owner() for owner-only
--     * DELETE: is_owner() on every table  (+ table GRANT in section 7)
-- ============================================================================

-- ---- users ----------------------------------------------------------------
create policy "authenticated view users" on users
  for select using (auth.role() = 'authenticated');

-- ---- customers (staff create/edit; owner deactivate) ----------------------
create policy "authenticated view customers"   on customers for select using (auth.role() = 'authenticated');
create policy "authenticated insert customers" on customers for insert with check (auth.role() = 'authenticated');
create policy "authenticated update customers" on customers for update using (auth.role() = 'authenticated');
create policy "owner delete customers"         on customers for delete using (is_owner());

-- ---- gold_rates (owner-only writes) ---------------------------------------
create policy "authenticated view gold_rates" on gold_rates for select using (auth.role() = 'authenticated');
create policy "owner insert gold_rates"       on gold_rates for insert with check (is_owner());
create policy "owner update gold_rates"       on gold_rates for update using (is_owner());
create policy "owner delete gold_rates"       on gold_rates for delete using (is_owner());

-- ---- vendors (owner-only writes; never hard-delete in app, but policy exists)
create policy "authenticated view vendors" on vendors for select using (auth.role() = 'authenticated');
create policy "owner insert vendors"       on vendors for insert with check (is_owner());
create policy "owner update vendors"       on vendors for update using (is_owner());

-- ---- intake_headers -------------------------------------------------------
create policy "authenticated view intake_headers"   on intake_headers for select using (auth.role() = 'authenticated');
create policy "authenticated insert intake_headers" on intake_headers for insert with check (auth.role() = 'authenticated');
create policy "authenticated update intake_headers" on intake_headers for update using (auth.role() = 'authenticated');
create policy "owner delete intake headers"         on intake_headers for delete using (is_owner());

-- ---- intake_items ---------------------------------------------------------
create policy "authenticated view intake_items"   on intake_items for select using (auth.role() = 'authenticated');
create policy "authenticated insert intake_items" on intake_items for insert with check (auth.role() = 'authenticated');
create policy "authenticated update intake_items" on intake_items for update using (auth.role() = 'authenticated');
create policy "owner delete intake items"         on intake_items for delete using (is_owner());

-- ---- purity_tests ---------------------------------------------------------
create policy "authenticated view purity_tests"   on purity_tests for select using (auth.role() = 'authenticated');
create policy "authenticated insert purity_tests" on purity_tests for insert with check (auth.role() = 'authenticated');
create policy "authenticated update purity_tests" on purity_tests for update using (auth.role() = 'authenticated');
create policy "owner delete purity tests"         on purity_tests for delete using (is_owner());

-- ---- melting_batches (owner-only writes) ----------------------------------
create policy "authenticated view melting_batches" on melting_batches for select using (auth.role() = 'authenticated');
create policy "owner insert melting_batches"       on melting_batches for insert with check (is_owner());
create policy "owner update melting_batches"       on melting_batches for update using (is_owner());
create policy "owner delete melting batches"       on melting_batches for delete using (is_owner());

-- ---- melting_batch_items (owner-only writes) ------------------------------
create policy "authenticated view melting_batch_items" on melting_batch_items for select using (auth.role() = 'authenticated');
create policy "owner insert melting_batch_items"       on melting_batch_items for insert with check (is_owner());
create policy "owner update melting_batch_items"       on melting_batch_items for update using (is_owner());
create policy "owner delete melting batch items"       on melting_batch_items for delete using (is_owner());

-- ---- stock (owner-only writes) --------------------------------------------
create policy "authenticated view stock" on stock for select using (auth.role() = 'authenticated');
create policy "owner insert stock"       on stock for insert with check (is_owner());
create policy "owner update stock"       on stock for update using (is_owner());
create policy "owner delete stock"       on stock for delete using (is_owner());

-- ---- repairs (staff create/update; owner delete) --------------------------
create policy "authenticated view repairs"   on repairs for select using (auth.role() = 'authenticated');
create policy "authenticated insert repairs" on repairs for insert with check (auth.role() = 'authenticated');
create policy "authenticated update repairs" on repairs for update using (auth.role() = 'authenticated');
create policy "owner delete repairs"         on repairs for delete using (is_owner());

-- ---- repair_tasks ---------------------------------------------------------
create policy "authenticated view repair_tasks"   on repair_tasks for select using (auth.role() = 'authenticated');
create policy "authenticated insert repair_tasks" on repair_tasks for insert with check (auth.role() = 'authenticated');
create policy "authenticated update repair_tasks" on repair_tasks for update using (auth.role() = 'authenticated');
create policy "owner delete repair tasks"         on repair_tasks for delete using (is_owner());

-- ---- audit_log (insert by any authenticated; owner delete) ----------------
create policy "authenticated view audit_log"   on audit_log for select using (auth.role() = 'authenticated');
create policy "authenticated insert audit_log" on audit_log for insert with check (auth.role() = 'authenticated');
create policy "owner delete audit log"         on audit_log for delete using (is_owner());


-- ============================================================================
-- 7. TABLE GRANTS
--   RLS alone is not enough — the authenticated role also needs table-level
--   DELETE privilege or deletes fail with "permission denied".
-- ============================================================================
grant delete on public.customers           to authenticated;
grant delete on public.intake_headers      to authenticated;
grant delete on public.intake_items        to authenticated;
grant delete on public.purity_tests        to authenticated;
grant delete on public.melting_batches     to authenticated;
grant delete on public.melting_batch_items to authenticated;
grant delete on public.stock               to authenticated;
grant delete on public.repairs             to authenticated;
grant delete on public.repair_tasks        to authenticated;
grant delete on public.audit_log           to authenticated;
grant delete on public.gold_rates          to authenticated;


-- ============================================================================
-- 8. SEED DATA
-- ============================================================================

-- 8.1 Users — create the auth accounts in Supabase Auth dashboard FIRST,
--     then insert matching public.users rows (id MUST equal auth uid).
insert into users (id, email, full_name, role) values
  ('497a115e-7ffc-4589-9a52-a98e35516a60', 'mohammedsalmanap@gmail.com', 'Mohammed Salman', 'owner'),
  ('2d675c44-433c-40c6-bd13-206113f5515c', 'salmuk301@gmail.com',        'Irfan Ahmed',     'staff')
on conflict (id) do nothing;

-- 8.2 Default vendors
insert into vendors (vendor_name, specialization, is_active) values
  ('Vendor 1', 'General Repair',  true),
  ('Vendor 2', 'Stone Setting',   true),
  ('Vendor 3', 'Polishing',       true),
  ('Vendor 4', 'Laser Soldering', true),
  ('Vendor 5', 'Custom Work',     true);


-- ============================================================================
-- 9. PRODUCTION RESET SCRIPT  (run as postgres when handing a clean DB to owner)
--   Truncates all transactional data; KEEPS users, vendors, gold_rates.
--   Comment this whole section out for a normal rebuild — only run when resetting.
-- ============================================================================
-- truncate table repair_tasks        cascade;
-- truncate table repairs             cascade;
-- truncate table melting_batch_items cascade;
-- truncate table melting_batches     cascade;
-- truncate table stock               cascade;
-- truncate table purity_tests        cascade;
-- truncate table intake_items        cascade;
-- truncate table intake_headers      cascade;
-- truncate table customers           cascade;
-- truncate table audit_log           cascade;
-- select setval('customer_code_seq', 1, false);
-- select setval('asset_code_seq',    1, false);
-- select setval('batch_code_seq',    1, false);
-- select setval('repair_code_seq',   1, false);
-- select setval('stock_code_seq',    1, false);

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
