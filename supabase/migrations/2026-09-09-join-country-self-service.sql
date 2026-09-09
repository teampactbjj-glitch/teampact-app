-- 09.09.2026 — RPC עצמאי: מתאמן קיים (מחובר בפועל, לא הרשמה אנונימית) פותח תהליך
-- הצטרפות/תשלום למנוי קאנטרי דרך "הגדרות" ← "הצטרפות לקאנטרי" ב-AthleteDashboard.jsx.
--
-- בכוונה לא נוגעים כאן ב-branch_ids / subscription_type / membership_status בכלל — רק
-- פותחים registration_payment_ref חדש ומחזירים את סניף הקאנטרי + המחיר מהמחירון. כל
-- השינוי בפועל (הוספת הסניף ל-branch_ids, עדכון subscription_type, החזרת membership_status
-- ל-active) קורה אך ורק ב-invoice4u-callback, ורק אחרי תשלום שאושר בפועל אצל Invoice4u
-- ותואם בדיוק למחירון (amountMatches) — כדי שלא תהיה שום דרך "לקבל גישה/מכסה" בלי לשלם
-- קודם בפועל. הרשאה: רק בעל/ת הפרופיל עצמו/ה או אפוטרופוס (is_guardian_of) — בדיוק כמו
-- self_cancel_membership הקיים.
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

  select price into v_price from branch_subscription_prices
    where branch_id = v_country_branch_id and subscription_type = p_subscription_type;

  v_ref := gen_random_uuid()::text;

  update members set registration_payment_ref = v_ref where id = p_member_id;

  return query select v_ref, v_country_branch_id, v_price;
end;
$function$;

grant execute on function public.join_country_start(uuid, text) to authenticated;
