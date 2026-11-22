-- Montuno: la importadora crea un enlace de checkout privado y lo manda por WhatsApp.
-- El comprador acepta las condiciones (texto exacto con hash y fecha) y paga; el dinero queda en un
-- escrow en Stellar: Trustless Work (escrow completo) o el contrato Soroban de Montuno (anticipo parcial).
-- Migración aditiva.

create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  created_by uuid not null references public.app_users (id),
  token text not null unique check (char_length(token) between 20 and 64),
  title text not null check (char_length(title) between 3 and 120),
  product_url text not null default '' check (char_length(product_url) <= 500),
  description text not null default '' check (char_length(description) <= 1000),
  price numeric(20, 7) not null check (price > 0),
  shipping numeric(20, 7) not null default 0 check (shipping >= 0),
  currency text not null default 'USD',
  delivery_days integer not null check (delivery_days between 1 and 180),
  mode text not null default 'full' check (mode in ('full', 'partial')),
  advance_amount numeric(20, 7) not null default 0 check (advance_amount >= 0),
  status text not null default 'active' check (status in ('active', 'accepted', 'expired', 'cancelled')),
  order_id uuid unique references public.orders (id),
  expires_at timestamptz not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mode = 'partial' or advance_amount = 0)
);
create index payment_links_org on public.payment_links (org_id, created_at desc);
create trigger payment_links_touch before update on public.payment_links for each row execute function public.touch_updated_at();

-- Consentimiento del comprador: el texto exacto que vio, su hash, el hash de los términos y la fecha.
create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid not null references public.app_users (id),
  disclosure_version text not null,
  disclosure_text text not null,
  disclosure_hash text not null,
  terms_hash text not null,
  accepted_at timestamptz not null default now()
);
create index consent_records_order on public.consent_records (order_id);

alter table public.orders
  add column escrow_provider text not null default 'trustless_work' check (escrow_provider in ('trustless_work', 'soroban')),
  add column escrow_mode text not null default 'full' check (escrow_mode in ('full', 'partial')),
  add column advance_amount numeric(20, 7) not null default 0 check (advance_amount >= 0),
  add column delivery_days integer,
  add column product_url text not null default '';

alter table public.escrows
  add column provider text not null default 'trustless_work' check (provider in ('trustless_work', 'soroban')),
  add column terms jsonb not null default '{}',
  add column advance_released numeric(20, 7) not null default 0;

-- Acción nueva del contrato Soroban: la importadora cobra el anticipo acordado.
alter table public.escrow_txs drop constraint if exists escrow_txs_action_check;
alter table public.escrow_txs
  add constraint escrow_txs_action_check
  check (action in ('deploy', 'fund', 'change_status', 'approve', 'release', 'dispute', 'resolve', 'claim_advance'));

-- Igual que el resto: sin acceso directo desde el navegador; todo pasa por la API.
alter table public.payment_links enable row level security;
alter table public.consent_records enable row level security;
revoke all on public.payment_links from anon, authenticated;
revoke all on public.consent_records from anon, authenticated;
