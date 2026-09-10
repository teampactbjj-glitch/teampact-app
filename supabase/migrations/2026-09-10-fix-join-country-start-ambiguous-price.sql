-- 10.09.2026 — תיקון באג: join_country_start נכשל עם "column reference price is ambiguous"
-- כי RETURNS TABLE(... price integer) יוצר משתנה מוסתר בשם price שמתנגש עם עמודת
-- branch_subscription_prices.price בתוך גוף הפונקציה. הפתרון: alias לטבלה (bsp) ואיזכור
-- מפורש bsp.price, כדי שאין שום עמימות. יושם ישירות בפרודקשן (Supabase MCP) ב-10.09.2026.
create or replace function public.join_country_start(p_member_id uuid, p_subscription_type text)
returns table(registration_payment_ref text, country_branch_id uuid, price integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_country_branch_id uuid;
  v_price integer;
  v_ref text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;
  if not (auth.uid() = p_member_id or is_guardian_of(p_member_id)) then
    raise exception 'unauthorized';
  end if;

  if p_subscription_type not in ('1x_week', '2x_week', '4x_week', 'unlimited') then
    raise exception 'invalid subscription_type';
  end if;

  if not exists (select 1 from members where id = p_member_id) then
    raise exception 'member not found';
  end if;

  select id into v_country_branch_id from branches where requires_facility_waiver = true limit 1;
  if v_country_branch_id is null then
    raise exception 'no country branch configured';
  end if;

  select bsp.price into v_price from branch_subscription_prices bsp
    where bsp.branch_id = v_country_branch_id and bsp.subscription_type = p_subscription_type;

  v_ref := gen_random_uuid()::text;

  update members set registration_payment_ref = v_ref where id = p_member_id;

  return query select v_ref, v_country_branch_id, v_price;
end;
$function$;

grant execute on function public.join_country_start(uuid, text) to authenticated;
