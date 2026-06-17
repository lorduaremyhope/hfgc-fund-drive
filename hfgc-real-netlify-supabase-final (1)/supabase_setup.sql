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


-- Currency support
alter table public.donations add column if not exists currency text default 'EUR';
alter table public.donations add column if not exists eur_amount numeric(12,2);
alter table public.donations add column if not exists exchange_rate numeric(18,8) default 1;

update public.donations
set currency = coalesce(currency, 'EUR'),
    eur_amount = coalesce(eur_amount, amount),
    exchange_rate = coalesce(exchange_rate, 1)
where eur_amount is null or currency is null or exchange_rate is null;


-- Currency v2 top choices supported by app: GBP, EUR, USD, CHF, RUB, NOK, SEK, HUF, DKK.
