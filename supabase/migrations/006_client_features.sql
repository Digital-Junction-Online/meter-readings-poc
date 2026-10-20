-- Paid add-on features, requested by a client and switched on by Wayne once
-- they have paid. Run this in the Supabase SQL editor after 005.
--
-- Billing itself happens outside the app (invoice via Rebill). This table
-- records what was asked for, what it was quoted at, and whether it is live.

create table if not exists client_features (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  feature_key text not null,
  status text not null default 'requested'
    check (status in ('requested', 'active', 'declined', 'cancelled')),
  -- Quoted monthly price in cents, copied from the catalogue at request time
  -- so a later price change doesn't silently rewrite what was agreed.
  price_cents integer not null default 0,
  requested_by uuid references auth.users (id),
  requested_at timestamptz not null default now(),
  activated_at timestamptz,
  activated_by uuid references auth.users (id),
  note text,
  unique (client_id, feature_key)
);

alter table client_features enable row level security;

create index if not exists client_features_status_idx on client_features (status);

-- ---------------------------------------------------------------- RLS

drop policy if exists "client reads own features" on client_features;
create policy "client reads own features" on client_features
  for select using (
    is_admin()
    or exists (
      select 1 from client_access ca
      where ca.client_id = client_features.client_id and ca.user_id = auth.uid()
    )
  );

-- A client may ask for a feature, never switch one on: the WITH CHECK pins
-- the status they can write to 'requested'.
drop policy if exists "client requests own features" on client_features;
create policy "client requests own features" on client_features
  for insert with check (
    status = 'requested'
    and exists (
      select 1 from client_access ca
      where ca.client_id = client_features.client_id and ca.user_id = auth.uid()
    )
  );

-- Re-asking after a decline. USING keeps them off anything already active,
-- WITH CHECK keeps the new status to 'requested'.
drop policy if exists "client re-requests own features" on client_features;
create policy "client re-requests own features" on client_features
  for update using (
    status <> 'active'
    and exists (
      select 1 from client_access ca
      where ca.client_id = client_features.client_id and ca.user_id = auth.uid()
    )
  )
  with check (
    status = 'requested'
    and exists (
      select 1 from client_access ca
      where ca.client_id = client_features.client_id and ca.user_id = auth.uid()
    )
  );

drop policy if exists "admin manages features" on client_features;
create policy "admin manages features" on client_features
  for all using (is_admin()) with check (is_admin());

-- Clients must not be able to rewrite the agreed price or backdate an
-- activation; RLS filters rows, not columns, so the grant does that part.
revoke update on client_features from authenticated;
grant update (status, requested_at, requested_by) on client_features to authenticated;
