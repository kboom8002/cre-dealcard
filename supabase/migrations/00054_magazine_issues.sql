-- Create magazine_issues table
create table if not exists public.magazine_issues (
    id uuid default gen_random_uuid() primary key,
    broker_id text not null,
    issue_date date not null,
    content jsonb not null default '{}'::jsonb,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(broker_id, issue_date)
);

-- RLS
alter table public.magazine_issues enable row level security;

create policy "Public can view magazine_issues" 
    on public.magazine_issues for select 
    using (true);

create policy "Service role can insert/update magazine_issues"
    on public.magazine_issues for all
    using (true)
    with check (true);
