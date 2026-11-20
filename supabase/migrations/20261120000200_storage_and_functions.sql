-- Buckets de Storage. Evidencias: privadas, solo con URL firmada de corta duración emitida por la API.
-- Fotos de artículos: lectura pública (son material comercial publicado por el proveedor).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('evidence', 'evidence', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4']),
  ('listing-photos', 'listing-photos', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sin políticas para anon/authenticated en storage.objects: subir, leer o borrar evidencias solo
-- es posible con la clave de servicio desde la API. Las fotos públicas se leen por URL pública.

-- ───────────── Cuota atómica ─────────────
-- Reserva una búsqueda si quedan disponibles en el día local. Idempotente por clave.
create or replace function public.reserve_search_quota(p_user uuid, p_day text, p_key text, p_limit integer)
returns table (ledger_id uuid, created boolean, used integer)
language plpgsql as $$
declare
  existing record;
  n integer;
begin
  -- Serializa las reservas del mismo usuario para evitar carreras (doble clic, pestañas).
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select q.id into existing from public.quota_ledger q where q.user_id = p_user and q.idempotency_key = p_key;
  if found then
    select count(*) into n from public.quota_ledger where user_id = p_user and day_key = p_day and status <> 'refunded';
    return query select existing.id, false, n;
    return;
  end if;

  select count(*) into n from public.quota_ledger where user_id = p_user and day_key = p_day and status <> 'refunded';
  if n >= p_limit then
    raise exception 'quota_exhausted' using errcode = 'P0001';
  end if;

  return query
    with ins as (
      insert into public.quota_ledger (user_id, day_key, status, idempotency_key)
      values (p_user, p_day, 'reserved', p_key)
      returning id
    )
    select ins.id, true, n + 1 from ins;
end $$;

-- Gasta créditos del tope global diario; devuelve false si no alcanza.
create or replace function public.spend_external_credits(p_day date, p_credits integer, p_cap integer)
returns boolean
language plpgsql as $$
declare
  ok boolean;
begin
  insert into public.external_search_budget (day, credits_used) values (p_day, 0) on conflict (day) do nothing;
  update public.external_search_budget
     set credits_used = credits_used + p_credits
   where day = p_day and credits_used + p_credits <= p_cap
  returning true into ok;
  return coalesce(ok, false);
end $$;

revoke all on function public.reserve_search_quota(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.spend_external_credits(date, integer, integer) from public, anon, authenticated;
