-- Update the handle_new_user trigger to default to 'broker' instead of 'public_user'
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'broker',
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  
  -- Also directly insert into broker_profiles as they are now broker by default
  insert into public.broker_profiles (user_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$ language plpgsql security definer;

-- Update existing users to 'broker' if they are 'public_user'
UPDATE public.profiles SET role = 'broker' WHERE role = 'public_user';
