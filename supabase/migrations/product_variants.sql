-- ========================================================
-- Product Variants + Rich Product Details
-- הרצה ידנית ב-Supabase SQL Editor
-- ========================================================

-- 1) הרחבת announcements לפרטי מוצר עשירים
alter table public.announcements
  add column if not exists description_long text,
  add column if not exists features jsonb default '[]'::jsonb,
  add column if not exists has_variants boolean default false,
  add column if not exists available_sizes text[] default array[]::text[],
  add column if not exists available_colors text[] default array[]::text[],
  add column if not exists bundle_items jsonb default null;
  -- bundle_items: לדוגמה, מוצר "סט נו-גי" יכיל:
  -- [{"product_id":"<uuid של מכנס>","discount_pct":10},{"product_id":"<uuid של רשגארד>","discount_pct":10}]

-- 2) טבלת וריאנטים (מידה/צבע/מלאי/SKU)
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.announcements(id) on delete cascade,
  size text,                         -- A0, A1, A2, A3, A4 (או null למוצר ללא מידה)
  color text,                        -- שחור, לבן, כחול (או null למוצר ללא צבע)
  sku text unique,                   -- מק"ט ייחודי
  price_override numeric,            -- אם null - לוקח מחיר מהמוצר הראשי
  stock int not null default 0,      -- מלאי נוכחי
  image_url text,                    -- תמונה ספציפית לוריאנט (אופציונלי)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_variants_product on public.product_variants(product_id);
create index if not exists idx_product_variants_active on public.product_variants(active) where active = true;

-- 3) הרחבת product_requests לשמירת בחירות המתאמן
alter table public.product_requests
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists selected_size text,
  add column if not exists selected_color text,
  add column if not exists quantity int not null default 1,
  add column if not exists notes text,
  add column if not exists unit_price numeric,
  add column if not exists total_price numeric;

-- 4) RLS על product_variants
alter table public.product_variants enable row level security;

-- קריאה: כולם יכולים לקרוא וריאנטים פעילים (אורחים ומתאמנים)
drop policy if exists "variants_read" on public.product_variants;
create policy "variants_read" on public.product_variants
  for select to anon, authenticated
  using (active = true or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and (profiles.role = 'trainer' or profiles.is_admin = true)
  ));

-- כתיבה/עדכון/מחיקה: רק מאמנים ואדמינים
drop policy if exists "variants_write" on public.product_variants;
create policy "variants_write" on public.product_variants
  for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and (profiles.role = 'trainer' or profiles.is_admin = true)
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and (profiles.role = 'trainer' or profiles.is_admin = true)
  ));

-- 5) trigger לעדכון updated_at אוטומטי
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tr_product_variants_updated on public.product_variants;
create trigger tr_product_variants_updated
  before update on public.product_variants
  for each row execute function public.tg_set_updated_at();

-- ========================================================
-- סיום
-- ========================================================
