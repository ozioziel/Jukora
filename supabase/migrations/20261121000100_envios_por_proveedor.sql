-- Jukora es una pasarela: el envío lo hace el proveedor, no la plataforma.
-- · El proveedor fija el costo de envío de cada artículo y, si quiere, ofrece retiro en su local.
-- · El comprador da su dirección y un teléfono de contacto (o elige retiro en la misma ciudad).
-- · El proveedor ve esos datos solo cuando el pago protegido está financiado (lo controla la API;
--   las tablas no son accesibles desde el navegador: RLS activo y sin permisos para anon/authenticated).
-- Migración aditiva: columnas nuevas con valores por defecto, sin tocar datos existentes.

alter table public.listings
  add column shipping_cost numeric(20, 7) not null default 0 check (shipping_cost >= 0),
  add column pickup_address text not null default '' check (char_length(pickup_address) <= 200);

comment on column public.listings.shipping_cost is 'Costo de envío por pedido que fija el proveedor (misma moneda que el precio).';
comment on column public.listings.pickup_address is 'Dirección del local para retiro. Vacía = no ofrece retiro.';

alter table public.orders
  add column fulfillment text not null default 'delivery' check (fulfillment in ('delivery', 'pickup')),
  add column shipping numeric(20, 7) not null default 0 check (shipping >= 0);

comment on column public.orders.fulfillment is 'delivery = el proveedor envía a la dirección del comprador; pickup = el comprador retira en el local.';
comment on column public.orders.shipping is 'Costo de envío incluido en amount (0 si es retiro).';
comment on column public.orders.delivery is 'Datos de entrega privados (dirección, referencia, teléfono, o datos de retiro). El proveedor los ve solo con el pago financiado.';
