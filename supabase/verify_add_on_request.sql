-- Proves a client can request an add-on and Wayne can switch it on, by
-- impersonating a real client user inside a transaction that is rolled back.
-- Nothing is left behind. Paste the whole thing into the SQL editor and Run.
--
-- Expect three NOTICE lines ending in "ALL CHECKS PASSED". Any permission
-- problem raises instead, naming which step failed.

begin;

do $$
declare
  v_user   uuid;
  v_client uuid;
  v_admin  uuid;
  v_status text;
begin
  -- A real client user and the client they have access to.
  select ca.user_id, ca.client_id into v_user, v_client
  from client_access ca
  limit 1;

  if v_user is null then
    raise exception 'No client_access rows — give a client user access to a client first.';
  end if;

  select id into v_admin from profiles where role = 'admin' limit 1;
  if v_admin is null then
    raise exception 'No admin profile found.';
  end if;

  -- ---------- 1. the client requests an add-on ----------
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text,
    true
  );

  insert into client_features (client_id, feature_key, status, price_cents, requested_by)
  values (v_client, 'usage_insights', 'requested', 4900, v_user);
  raise notice '1/3 client CAN request an add-on';

  -- ---------- 2. the client must NOT be able to switch it on ----------
  begin
    update client_features
      set status = 'active'
      where client_id = v_client and feature_key = 'usage_insights';
    -- RLS should have matched no rows rather than erroring, so check the value.
    select status into v_status
    from client_features
    where client_id = v_client and feature_key = 'usage_insights';
    if v_status = 'active' then
      raise exception 'SECURITY HOLE: a client switched their own add-on on';
    end if;
    raise notice '2/3 client CANNOT self-activate (status still %)', v_status;
  exception
    when insufficient_privilege then
      raise notice '2/3 client CANNOT self-activate (blocked outright)';
  end;

  -- ---------- 3. an admin switches it on ----------
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text,
    true
  );

  update client_features
    set status = 'active', activated_at = now(), activated_by = v_admin
    where client_id = v_client and feature_key = 'usage_insights';

  select status into v_status
  from client_features
  where client_id = v_client and feature_key = 'usage_insights';

  if v_status is distinct from 'active' then
    raise exception 'Admin could not activate — status is %', v_status;
  end if;
  raise notice '3/3 admin CAN activate — ALL CHECKS PASSED';
end $$;

rollback;
