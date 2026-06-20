-- ============================================================
-- פיצ'ר הורה רב-ילדים — שלב 4: בדיקת בידוד בין משפחות
-- מריצים על STAGING בלבד (ref tfrcyntrusfrjcpevotq).
--
-- גרסה 5: עוקף את tr_soft_delete על members. מחיקה ראשונה רק
-- מסמנת deleted_at (soft), מחיקה שנייה מוחקת פיזית. לכן הניקוי
-- עושה קודם UPDATE deleted_at=now() ואז DELETE (מחיקה פיזית).
-- SECURITY DEFINER + ניקוי בהתחלה ובסוף. בלי טבלה זמנית.
--
-- זורע 2 הורים + 3 ילדים, בודק is_guardian_of() מכל זווית, מנקה
-- אחריו לחלוטין, ומחזיר טבלה. כל שורה: pass חייב להיות t.
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.guardian_isolation_test()
RETURNS TABLE(name text, expected boolean, got boolean, pass boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p1  uuid := '11111111-1111-1111-1111-111111111111';
  p2  uuid := '22222222-2222-2222-2222-222222222222';
  c1a uuid := 'a1a1a1a1-0000-0000-0000-000000000001';
  c1b uuid := 'a1a1a1a1-0000-0000-0000-000000000002';
  c2a uuid := 'a2a2a2a2-0000-0000-0000-000000000001';
BEGIN
  -- ניקוי מקדים (שאריות): soft ואז פיזי
  UPDATE public.members SET deleted_at = now()
    WHERE guardian_id IN (p1, p2) OR id IN (c1a, c1b, c2a, p1, p2);
  DELETE FROM public.members
    WHERE guardian_id IN (p1, p2) OR id IN (c1a, c1b, c2a, p1, p2);
  DELETE FROM public.profiles WHERE id IN (p1, p2);
  DELETE FROM auth.users WHERE id IN (p1, p2);

  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    ('00000000-0000-0000-0000-000000000000', p1, 'authenticated','authenticated',
     'p1.test@teampact.local','x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}','{}'),
    ('00000000-0000-0000-0000-000000000000', p2, 'authenticated','authenticated',
     'p2.test@teampact.local','x', now(), now(), now(),
     '{"provider":"email","providers":["email"]}','{}');

  INSERT INTO public.members (id, full_name, status, guardian_id) VALUES
    (c1a, 'ילד 1 של הורה א', 'pending', p1),
    (c1b, 'ילד 2 של הורה א', 'pending', p1),
    (c2a, 'ילד 1 של הורה ב', 'pending', p2);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p1::text, 'role','authenticated')::text, true);
  RETURN QUERY SELECT t.n, t.e, t.g, (t.e = t.g) FROM (VALUES
    ('הורה א → ילד שלו 1 (צפוי TRUE)',  true,  public.is_guardian_of(c1a)),
    ('הורה א → ילד שלו 2 (צפוי TRUE)',  true,  public.is_guardian_of(c1b)),
    ('הורה א → ילד משפחה אחרת (חייב FALSE)', false, public.is_guardian_of(c2a))
  ) AS t(n,e,g);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p2::text, 'role','authenticated')::text, true);
  RETURN QUERY SELECT t.n, t.e, t.g, (t.e = t.g) FROM (VALUES
    ('הורה ב → ילד שלו (צפוי TRUE)',  true,  public.is_guardian_of(c2a)),
    ('הורה ב → ילד משפחה אחרת 1 (חייב FALSE)', false, public.is_guardian_of(c1a)),
    ('הורה ב → ילד משפחה אחרת 2 (חייב FALSE)', false, public.is_guardian_of(c1b))
  ) AS t(n,e,g);

  PERFORM set_config('request.jwt.claims',
    '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
  RETURN QUERY SELECT t.n, t.e, t.g, (t.e = t.g) FROM (VALUES
    ('זר → ילד של הורה א (חייב FALSE)', false, public.is_guardian_of(c1a))
  ) AS t(n,e,g);

  -- ניקוי סופי: soft ואז פיזי
  UPDATE public.members SET deleted_at = now()
    WHERE guardian_id IN (p1, p2) OR id IN (c1a, c1b, c2a, p1, p2);
  DELETE FROM public.members
    WHERE guardian_id IN (p1, p2) OR id IN (c1a, c1b, c2a, p1, p2);
  DELETE FROM public.profiles WHERE id IN (p1, p2);
  DELETE FROM auth.users WHERE id IN (p1, p2);
END $$;

SELECT * FROM pg_temp.guardian_isolation_test();
