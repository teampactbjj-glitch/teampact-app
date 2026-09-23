-- מבצע על מוצרים בחנות (23.09.2026)
alter table public.announcements
  add column if not exists sale_price numeric,
  add column if not exists sale_end_date date,
  add column if not exists sale_label text;
