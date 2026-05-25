-- ============================================================
-- TeamPact — Explicit GRANTs for Supabase Data API change
-- ============================================================
-- רקע: מ-30 מאי 2026 טבלאות חדשות לא נחשפות אוטומטית ל-Data API.
-- מ-30 אוקטובר 2026 זה יחול גם על פרויקטים קיימים.
-- הסקריפט הזה מוסיף GRANTs מפורשים לכל הטבלאות הקיימות
-- בהתאם ל-RLS הקיים — ללא שינוי הרשאות אמיתיות.
--
-- הרץ ב-Supabase SQL Editor — בטוח להרצה מרובה.
-- ============================================================

-- ============================================================
-- 1. PROFILES
-- ============================================================
-- SELECT/INSERT/UPDATE דורש authenticated (auth.uid() IS NOT NULL)
-- anon לא ניגש לפרופילים ישירות
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO service_role;
-- anon: אין גישה ל-profiles (לא נחוץ לפלואו הקיים)

-- ============================================================
-- 2. BRANCHES
-- ============================================================
-- SELECT: true — גם anon צריך לקרוא סניפים (עמוד RegistrationPage)
-- כתיבה: רק מאמן (authenticated + role='trainer')
GRANT SELECT ON public.branches TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO service_role;

-- ============================================================
-- 3. CLASSES
-- ============================================================
-- SELECT: true — כולם רואים לוח שיעורים
-- כתיבה: רק מאמן
GRANT SELECT ON public.classes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO service_role;

-- ============================================================
-- 4. COACHES
-- ============================================================
-- SELECT: authenticated בלבד
-- כתיבה: רק מאמן
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaches TO service_role;

-- ============================================================
-- 5. MEMBERS
-- ============================================================
-- SELECT: true — anon צריך לחפש לפי טלפון (phone-based login)
-- INSERT: anon יכול ליצור pending registration (QR flow)
-- שאר הפעולות: authenticated (מאמן)
GRANT SELECT, INSERT ON public.members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members TO service_role;

-- ============================================================
-- 6. MEMBER_CLASSES
-- ============================================================
-- SELECT/INSERT/DELETE: true — מתאמן (anon) מנהל את השיעורים שלו
-- ALL: trainer (authenticated)
GRANT SELECT, INSERT, DELETE ON public.member_classes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_classes TO service_role;

-- ============================================================
-- 7. CLASS_REGISTRATIONS (legacy — Supabase auth users)
-- ============================================================
-- הכל דרך authenticated בלבד
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_registrations TO service_role;

-- ============================================================
-- 8. CHECKINS
-- ============================================================
-- SELECT: true — כולם רואים נוכחות (לוח שיעורים חי)
-- כתיבה: מאמן בלבד
GRANT SELECT ON public.checkins TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkins TO service_role;

-- ============================================================
-- 9. REGISTRATIONS (legacy — מה-schema המקורי)
-- ============================================================
GRANT SELECT ON public.registrations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO service_role;

-- ============================================================
-- 10. ANNOUNCEMENTS
-- ============================================================
-- SELECT: true — כולם רואים הודעות
-- כתיבה: מאמן בלבד
GRANT SELECT ON public.announcements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO service_role;

-- ============================================================
-- 11. PRODUCT_REQUESTS
-- ============================================================
-- INSERT: true — מתאמן (anon) יכול לשלוח בקשה
-- SELECT/UPDATE/DELETE: authenticated (מאמן או הספורטאי עצמו)
GRANT INSERT ON public.product_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_requests TO service_role;

-- ============================================================
-- 12. PUSH_SUBSCRIPTIONS
-- ============================================================
-- רק משתמש מחובר מנהל את ה-push שלו
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;

-- ============================================================
-- 13. PROFILE_CHANGE_REQUESTS
-- ============================================================
-- מתאמן (phone flow = anon) שולח בקשה, מאמן מאשר
GRANT INSERT ON public.profile_change_requests TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_change_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_change_requests TO service_role;

-- ============================================================
-- אימות: רשימת GRANTs בפועל (אופציונלי — הרץ בנפרד לבדיקה)
-- ============================================================
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND grantee IN ('anon', 'authenticated', 'service_role')
-- ORDER BY table_name, grantee, privilege_type;
