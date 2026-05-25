-- ============================================================
-- Migration 00014: Auto-create profiles row on auth.users insert
-- Also auto-create broker_profiles row when role is set to 'broker'
-- ============================================================

-- Function: create profiles row when a new user signs up via Supabase Auth
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'public_user',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: fires after each INSERT into auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Function: auto-create broker_profiles row when profiles.role is updated to 'broker'
create or replace function handle_broker_role_assigned()
returns trigger as $$
begin
  if new.role = 'broker' and (old.role is null or old.role <> 'broker') then
    insert into public.broker_profiles (user_id)
    values (new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Trigger: fires after each UPDATE on profiles
drop trigger if exists on_profile_role_changed on public.profiles;
create trigger on_profile_role_changed
  after update on public.profiles
  for each row execute function handle_broker_role_assigned();

-- Allow admin to update any profile's role (needed for broker approval workflow)
drop policy if exists "profiles_admin_update" on profiles;
create policy "profiles_admin_update"
  on profiles for update
  to authenticated
  using (is_admin())
  with check (is_admin());
