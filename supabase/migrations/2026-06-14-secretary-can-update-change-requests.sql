-- ============================================================================
-- מזכיר/ה — הרשאת אישור/דחייה של בקשות שינוי (profile_change_requests)
-- ============================================================================
-- בעיה: מזכירה מאשרת/דוחה בקשת שינוי מנוי → "מתרענן אבל לא קורה כלום",
--       הבקשה נשארת ממתינה, בלי הודעת שגיאה.
-- סיבה: ה-policy "pcr_update_admin" מתיר UPDATE רק ל-is_approved_admin().
--       המזכירה רואה את הבקשות (pcr_select_owner_or_trainer = is_approved_trainer),
--       אבל UPDATE (status='approved'/'rejected') נחסם בשקט → 0 שורות.
--
-- פתרון: policy UPDATE נוסף שמתיר גם למזכיר/ה (role='trainer', is_secretary=true).
--        policies מסוג PERMISSIVE מתאחדים ב-OR, אז האדמין ממשיך לעבוד כרגיל.
-- בטוח להריץ יותר מפעם אחת.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "pcr_update_secretary" ON public.profile_change_requests;
CREATE POLICY "pcr_update_secretary" ON public.profile_change_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'trainer'
        AND is_secretary = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'trainer'
        AND is_secretary = true
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
