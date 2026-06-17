-- Run this in Supabase SQL Editor before/after deploying.
-- This matches the Netlify + Supabase package.

create table if not exists public.settings (
  id integer primary key default 1,
  goal numeric default 250000,
  show_progress boolean default true,
  show_leaderboard boolean default true,
  updated_at timestamptz default now()
);

insert into public.settings (id, goal, show_progress, show_leaderboard)
values (1, 250000, true, true)
on conflict (id) do nothing;

-- Your donations table already exists. These make sure all columns needed by the app exist.
alter table public.donations add column if not exists pledge_date date;
alter table public.donations add column if not exists proof_url text;
alter table public.donations add column if not exists status text default 'Pending';
alter table public.donations add column if not exists note text;
alter table public.donations add column if not exists created_at timestamptz default now();

alter table public.settings enable row level security;
alter table public.donations enable row level security;
