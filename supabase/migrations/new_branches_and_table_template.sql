-- ============================================================
-- TeamPact — הוספת סניפים עתידיים + תבנית לטבלה חדשה
-- ============================================================
-- קובץ זה מכיל:
--   A. הוספת סניפים: חולון קאנטרי ותל אביב
--   B. תבנית SQL לכל טבלה חדשה שתיצור בעתיד
--      (הכרחי אחרי 30 מאי 2026 בפרויקטים חדשים /
--       30 אוקטובר 2026 בפרויקט הנוכחי)
-- ============================================================


-- ============================================================
-- A. הוספת סניפים עתידיים
-- ============================================================
-- הרץ כשהסניפים מוכנים. בטוח להרצה מרובה (INSERT ... ON CONFLICT DO NOTHING)

INSERT INTO public.branches (name)
SELECT x.name
FROM (VALUES
  ('חולון קאנטרי'),
  ('תל אביב')
) AS x(name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.branches b WHERE b.name = x.name
);

-- לאחר ההרצה, ב-Dashboard של Supabase תוכל לראות את ה-UUIDs
-- שנוצרו ולהשתמש בהם לשיוך מתאמנים / מאמנים לסניפים.

-- ============================================================
-- אימות סניפים:
-- ============================================================
-- SELECT id, name FROM public.branches ORDER BY name;


-- ============================================================
-- B. תבנית לטבלה חדשה
-- ============================================================
-- העתק-הדבק את הבלוק הזה כשתרצה ליצור טבלה חדשה.
-- שנה: your_table_name, שמות עמודות, ורמות הגישה.
-- ============================================================

/*

-- שלב 1: יצירת הטבלה
CREATE TABLE IF NOT EXISTS public.your_table_name (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id   uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  -- ... שאר העמודות ...
  created_at  timestamptz DEFAULT now()
);

-- שלב 2: GRANTs מפורשים (חובה אחרי 30 אוקטובר 2026)
-- בחר את הרמה המתאימה לפי סוג הטבלה:

-- אפשרות א׳: טבלה פומבית (כולם קוראים, מאמן כותב)
GRANT SELECT ON public.your_table_name TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO service_role;

-- אפשרות ב׳: טבלה פרטית (authenticated בלבד)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO service_role;

-- אפשרות ג׳: טבלה שמתאמן (anon) יכול להכניס אליה
GRANT INSERT ON public.your_table_name TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table_name TO service_role;

-- שלב 3: הפעלת RLS (חובה!)
ALTER TABLE public.your_table_name ENABLE ROW LEVEL SECURITY;

-- שלב 4: מדיניות קריאה (התאם לפי הצורך)

-- דוגמה א׳: כולם קוראים
CREATE POLICY "your_table_select" ON public.your_table_name
  FOR SELECT USING (true);

-- דוגמה ב׳: רק authenticated קורא
CREATE POLICY "your_table_select" ON public.your_table_name
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- דוגמה ג׳: כל אחד קורא רק את שורות הסניף שלו
-- (נדרש שה-member יהיה מחובר ויש לו branch_id ב-members)
CREATE POLICY "your_table_select_own_branch" ON public.your_table_name
  FOR SELECT USING (
    branch_id IN (
      SELECT unnest(branch_ids)
      FROM public.members
      WHERE phone = current_setting('request.jwt.claims', true)::json->>'phone'
    )
    OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- שלב 5: מדיניות כתיבה (בדרך כלל רק מאמן)
CREATE POLICY "your_table_write" ON public.your_table_name
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'trainer')
  );

-- שלב 6: אינדקסים (אופציונלי אבל מומלץ)
CREATE INDEX IF NOT EXISTS idx_your_table_branch ON public.your_table_name(branch_id);
CREATE INDEX IF NOT EXISTS idx_your_table_created ON public.your_table_name(created_at DESC);

*/

-- ============================================================
-- C. בדיקת אבטחה — הרץ אחרי כל שינוי
-- ============================================================
-- הסקריפט הבא מציג את כל הטבלאות ב-public שיש להן RLS פעיל
-- ואלו שאין להן (אסור שיהיו כאלה עם נתוני תלמידים):

SELECT
  t.tablename,
  CASE WHEN c.relrowsecurity THEN '✅ RLS מופעל' ELSE '❌ RLS כבוי!' END AS rls_status,
  CASE WHEN c.relrowsecurity THEN '✅' ELSE '⚠️ בדוק!' END AS alert
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
ORDER BY c.relrowsecurity, t.tablename;
