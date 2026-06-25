-- Sync all remaining auth users who might have missed the trigger
INSERT INTO public.profiles (id, role, display_name)
SELECT id, 'broker', split_part(email, '@', 1)
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- Ensure all users with broker role have a broker_profiles entry
INSERT INTO public.broker_profiles (user_id)
SELECT id FROM public.profiles WHERE role = 'broker'
ON CONFLICT DO NOTHING;
