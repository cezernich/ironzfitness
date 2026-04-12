-- Stripe subscriptions — one row per user tracking their current premium state.
-- Writes come from the stripe-webhook Edge Function (service role). Clients
-- only read their own row via RLS.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  plan text not null check (plan in ('monthly','annual')),
  status text not null default 'active' check (status in ('active','past_due','canceled','expired')),
  source text not null default 'stripe' check (source in ('stripe','apple','promo')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create index if not exists idx_subscriptions_user
  on public.subscriptions(user_id);
create index if not exists idx_subscriptions_stripe_subscription_id
  on public.subscriptions(stripe_subscription_id);

alter table public.subscriptions enable row level security;

-- Users can read their own subscription row.
drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Service role (used by the stripe-webhook Edge Function) has full access.
drop policy if exists "Service role manages subscriptions" on public.subscriptions;
create policy "Service role manages subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

-- updated_at maintenance.
create or replace function public._subscriptions_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists _subscriptions_touch_updated_at on public.subscriptions;
create trigger _subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public._subscriptions_touch_updated_at();
