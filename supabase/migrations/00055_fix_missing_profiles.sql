-- Ensure worldkbeauty@gmail.com has a profile
INSERT INTO public.profiles (id, role, display_name)
SELECT id, 'broker', split_part(email, '@', 1)
FROM auth.users
WHERE email = 'worldkbeauty@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'broker';

-- Ensure all users with broker role have a broker_profiles entry
INSERT INTO public.broker_profiles (user_id)
SELECT id FROM public.profiles WHERE role = 'broker'
ON CONFLICT DO NOTHING;
