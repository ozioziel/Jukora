-- Esquema base. La API (NestJS) es el único cliente: se conecta con un rol propio y aplica la
-- autorización por entidad. RLS queda activado y sin políticas para anon/authenticated como
-- defensa en profundidad (nadie puede leer ni escribir con la clave pública de Supabase).

create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── Cuentas ─────────────────────────
create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  stellar_address text not null unique check (stellar_address ~ '^G[A-Z2-7]{55}$'),
  auth_method text not null check (auth_method in ('pollar', 'wallet', 'demo')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  locale text not null default 'es' check (locale in ('es', 'en', 'qu', 'ay')),
  time_zone text not null default 'America/La_Paz',
  modes text[] not null default '{buyer}' check (modes <@ array['buyer', 'supplier']::text[] and cardinality(modes) >= 1),
  active_mode text not null default 'buyer' check (active_mode in ('buyer', 'supplier')),
  staff_roles text[] not null default '{}' check (staff_roles <@ array['arbiter', 'verifier', 'admin']::text[]),
  kyc_status text not null default 'not_started' check (kyc_status in ('not_started', 'pending', 'approved', 'declined', 'expired')),
  kyc_session_ref text,
  -- Huella HMAC del documento (nunca el número ni fotos): una persona, una cuenta.
  kyc_fingerprint text unique,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_mode_enabled check (active_mode = any (modes))
);
create trigger app_users_touch before update on public.app_users for each row execute function public.touch_updated_at();

create table public.auth_challenges (
  nonce text primary key,
  stellar_address text not null,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);
create index auth_challenges_expires on public.auth_challenges (expires_at);

create table public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index auth_sessions_user on public.auth_sessions (user_id);

-- ───────────────────────── Organizaciones (proveedores) ─────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users (id),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  country char(2) not null,
  city text not null default '',
  trust text not null default 'registered' check (trust in ('registered', 'kyb_pending', 'kyb_verified', 'kyb_rejected', 'kyb_expired')),
  kyb_session_ref text,
  kyb_verified_at timestamptz,
  kyb_expires_at timestamptz,
  payout_address text check (payout_address is null or payout_address ~ '^G[A-Z2-7]{55}$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user on public.memberships (user_id);

-- ───────────────────────── Negocios (casas) y recursos ─────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users (id),
  name text not null check (char_length(name) between 2 and 60),
  sector text not null default 'other' check (sector in ('restaurant', 'cafe', 'workshop', 'store', 'studio', 'other')),
  intent text not null check (intent in ('start', 'expand')),
  country char(2),
  city text,
  objective text not null default '' check (char_length(objective) <= 600),
  budget_max numeric(20, 7) check (budget_max is null or budget_max > 0),
  budget_currency text check (budget_currency ~ '^[A-Z]{3,5}$'),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner on public.projects (owner_id) where status <> 'archived';
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

create table public.search_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users (id),
  project_id uuid references public.projects (id),
  idempotency_key text not null,
  request jsonb not null,
  status text not null default 'accepted'
    check (status in ('accepted', 'planning', 'resources_ready', 'done', 'partial', 'empty', 'error', 'cancelled')),
  plan jsonb,
  error_code text,
  ai_provider text,
  ai_model text,
  ai_is_demo boolean not null default false,
  rules_version text not null default 'v1',
  external_credits_used integer not null default 0,
  external_credit_budget integer not null default 8,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (owner_id, idempotency_key)
);
create index search_runs_owner on public.search_runs (owner_id, created_at desc);

create table public.resource_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  search_run_id uuid references public.search_runs (id),
  slug text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  label text not null,
  category text not null,
  quantity integer check (quantity is null or quantity > 0),
  unit text not null default 'unidad',
  reason text not null default '',
  required_specs jsonb not null default '[]',
  optional_specs jsonb not null default '[]',
  search_terms jsonb not null default '[]',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);
create trigger resource_requirements_touch before update on public.resource_requirements for each row execute function public.touch_updated_at();

create table public.search_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.app_users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index search_drafts_owner on public.search_drafts (owner_id, updated_at desc);

create table public.search_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.search_runs (id) on delete cascade,
  type text not null check (type in ('accepted', 'planning', 'resources_ready', 'candidate_batch', 'partial', 'done', 'error', 'cancelled')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index search_events_run on public.search_events (run_id, id);

create table public.search_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.search_runs (id) on delete cascade,
  resource_slug text not null,
  dedupe_key text not null,
  payload jsonb not null,
  score numeric(6, 1) not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, resource_slug, dedupe_key)
);
create index search_candidates_resource on public.search_candidates (run_id, resource_slug, score desc);

-- Categorías ya buscadas en una corrida: volver a abrirlas no consume cuota ni créditos.
create table public.search_category_fetches (
  run_id uuid not null references public.search_runs (id) on delete cascade,
  resource_slug text not null,
  status text not null check (status in ('fetching', 'done', 'error', 'budget_exhausted')),
  credits_used integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (run_id, resource_slug)
);

-- Cuota diaria (10 búsquedas confirmadas). Reserva → consumo/devolución, auditable.
create table public.quota_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  day_key text not null,
  run_id uuid references public.search_runs (id),
  status text not null check (status in ('reserved', 'consumed', 'refunded')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index quota_ledger_day on public.quota_ledger (user_id, day_key) where status <> 'refunded';

-- Tope global diario de créditos de búsqueda externa (presupuesto 0 USD).
create table public.external_search_budget (
  day date primary key,
  credits_used integer not null default 0 check (credits_used >= 0)
);

-- ───────────────────────── Catálogo ─────────────────────────
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id),
  title text not null check (char_length(title) between 3 and 120),
  description text not null default '' check (char_length(description) <= 4000),
  category text not null,
  specs jsonb not null default '{}',
  unit text not null default 'unidad',
  price numeric(20, 7) check (price is null or price > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,5}$'),
  quote_only boolean not null default false,
  stock integer check (stock is null or stock >= 0),
  min_qty integer not null default 1 check (min_qty > 0),
  condition text not null default 'new' check (condition in ('new', 'used')),
  origin_country char(2) not null,
  origin_city text not null default '',
  ships_to text[] not null default '{}',
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  warranty text not null default '',
  payment_terms text not null default '',
  photos jsonb not null default '[]',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_demo boolean not null default false,
  search_doc tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(category, '') || ' ' || coalesce(description, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint priced_or_quote check (quote_only or price is not null)
);
create index listings_search on public.listings using gin (search_doc);
create index listings_org on public.listings (org_id);
create index listings_published on public.listings (category) where status = 'published';
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();

-- ───────────────────────── Solicitudes y cotizaciones ─────────────────────────
create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.app_users (id),
  project_id uuid references public.projects (id),
  requirement_id uuid references public.resource_requirements (id),
  listing_id uuid references public.listings (id),
  title text not null,
  specs jsonb not null default '[]',
  quantity integer not null check (quantity > 0),
  unit text not null default 'unidad',
  destination_country char(2) not null,
  destination_city text not null default '',
  deadline_days integer,
  currency text not null default 'USD',
  needs jsonb not null default '[]',
  visibility text not null default 'private' check (visibility in ('private', 'invited', 'public')),
  status text not null default 'draft' check (status in ('draft', 'sent', 'published', 'answered', 'closed', 'cancelled', 'expired')),
  -- El presupuesto solo se comparte con permiso explícito y separado.
  share_budget boolean not null default false,
  budget_max numeric(20, 7),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rfqs_public on public.rfqs (created_at desc) where visibility = 'public' and status in ('published', 'answered');
create trigger rfqs_touch before update on public.rfqs for each row execute function public.touch_updated_at();

create table public.rfq_invites (
  rfq_id uuid not null references public.rfqs (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (rfq_id, org_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid references public.rfqs (id),
  listing_id uuid references public.listings (id),
  org_id uuid not null references public.organizations (id),
  buyer_id uuid not null references public.app_users (id),
  version integer not null default 1,
  previous_quote_id uuid references public.quotes (id),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'rejected', 'withdrawn', 'expired')),
  description text not null default '',
  quantity integer not null check (quantity > 0),
  unit_price numeric(20, 7) not null check (unit_price > 0),
  shipping numeric(20, 7) not null default 0 check (shipping >= 0),
  taxes numeric(20, 7) not null default 0 check (taxes >= 0),
  total numeric(20, 7) not null check (total > 0),
  currency text not null,
  lead_time_days integer,
  incoterm text,
  warranty text not null default '',
  terms text not null default '',
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);
create index quotes_buyer on public.quotes (buyer_id, created_at desc);
create index quotes_org on public.quotes (org_id, created_at desc);

-- ───────────────────────── Pedidos, escrow, envíos ─────────────────────────
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.app_users (id),
  org_id uuid not null references public.organizations (id),
  quote_id uuid unique references public.quotes (id),
  listing_id uuid references public.listings (id),
  project_id uuid references public.projects (id),
  requirement_id uuid references public.resource_requirements (id),
  title text not null,
  quantity integer not null check (quantity > 0),
  unit text not null default 'unidad',
  amount numeric(20, 7) not null check (amount > 0),
  currency text not null,
  platform_fee numeric(20, 7) not null check (platform_fee >= 0),
  platform_fee_percent numeric(6, 2) not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'funded', 'preparing', 'shipped', 'delivery_notified', 'in_review', 'accepted', 'completed', 'cancelled')),
  -- Dirección de entrega: privada, solo comprador, proveedor del pedido y árbitro asignado.
  delivery jsonb not null default '{}',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_buyer on public.orders (buyer_id, created_at desc);
create index orders_org on public.orders (org_id, created_at desc);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create table public.escrows (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  network text not null check (network in ('testnet', 'mainnet')),
  engagement_id text not null unique,
  contract_id text,
  roles jsonb not null,
  amount numeric(20, 7) not null,
  platform_fee_percent numeric(6, 2) not null,
  asset_code text not null,
  asset_address text not null,
  status text not null default 'not_created'
    check (status in ('not_created', 'created', 'funding_pending', 'funded', 'approval_pending', 'release_pending', 'released', 'disputed', 'resolution_pending', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger escrows_touch before update on public.escrows for each row execute function public.touch_updated_at();

create table public.escrow_txs (
  id uuid primary key default gen_random_uuid(),
  escrow_id uuid not null references public.escrows (id) on delete cascade,
  action text not null check (action in ('deploy', 'fund', 'change_status', 'approve', 'release', 'dispute', 'resolve')),
  signer text not null,
  unsigned_xdr text,
  tx_hash text unique,
  status text not null default 'prepared' check (status in ('prepared', 'submitted', 'confirmed', 'failed')),
  error text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger escrow_txs_touch before update on public.escrow_txs for each row execute function public.touch_updated_at();

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  carrier text not null,
  tracking text not null default '',
  is_simulated boolean not null default true,
  events jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ───────────────────────── Disputas y evidencias ─────────────────────────
create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  opened_by uuid not null references public.app_users (id),
  reason text not null check (reason in ('not_delivered', 'late', 'damaged', 'different_product', 'wrong_quantity', 'terms_breach', 'other')),
  narrative text not null check (char_length(narrative) between 10 and 4000),
  claimed_amount numeric(20, 7),
  status text not null default 'open'
    check (status in ('draft', 'open', 'collecting_evidence', 'review', 'decided', 'execution_pending', 'resolved', 'closed')),
  arbiter_id uuid references public.app_users (id),
  decision jsonb,
  evidence_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger disputes_touch before update on public.disputes for each row execute function public.touch_updated_at();

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  dispute_id uuid references public.disputes (id),
  uploaded_by uuid not null references public.app_users (id),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  note text not null default '',
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now()
);
create index evidence_order on public.evidence (order_id);

-- ───────────────────────── Pagos con QR (rampas) ─────────────────────────
create table public.ramps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id),
  order_id uuid references public.orders (id),
  kind text not null check (kind in ('simulated_bob', 'pollar_sandbox', 'pollar_live')),
  fiat_amount numeric(20, 2) not null,
  fiat_currency text not null,
  token_amount numeric(20, 7) not null,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'processing', 'credited', 'expired', 'failed')),
  reference text not null unique,
  qr_payload text,
  provider_ref text,
  tx_hash text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger ramps_touch before update on public.ramps for each row execute function public.touch_updated_at();

-- ───────────────────────── Notificaciones, reseñas, auditoría ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  kind text not null,
  entity_type text not null,
  entity_id uuid not null,
  data jsonb not null default '{}',
  requires_action boolean not null default false,
  read_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on public.notifications (user_id, created_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  -- Solo pedidos auténticos pueden reseñar; las reseñas sintéticas DEMO no tienen pedido.
  order_id uuid references public.orders (id),
  author_id uuid not null references public.app_users (id),
  org_id uuid not null references public.organizations (id),
  supplier_rating smallint not null check (supplier_rating between 1 and 5),
  product_rating smallint check (product_rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (order_id, author_id),
  constraint review_needs_order check (is_demo or order_id is not null)
);
create index reviews_org on public.reviews (org_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.app_users (id),
  entity_type text not null,
  entity_id text not null,
  action text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_entity on public.audit_events (entity_type, entity_id);

-- ───────────────────────── RLS: denegar por defecto ─────────────────────────
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
