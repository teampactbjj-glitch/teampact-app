-- מיגרציה: חסימת רישום ידני של מאמן/מזכירה/מנהל למתאמן בלי מנוי פעיל (class_registrations).
--
-- רקע: דודי דיווח שאפשר היה למאמן לרשום מתאמן לשיעור (TodayClasses.jsx, "+ הוסף"
-- בחיפוש מתאמנים) גם כשהמנוי של המתאמן מוקפא/פג/מבוטל. תוקן קודם בצד הלקוח
-- (09.09.2026, addRegisteredMember + searchVisitor) אבל ה-RLS של הכתיבה ל-
-- class_registrations לא אכף את זה בפועל למסלול הזה — הבדיקה היחידה הייתה
-- profiles.role = 'trainer', בלי שום קשר לסטטוס המנוי של המתאמן שנרשם.
--
-- אותה פרצה בדיוק כבר תוקנה ב-06.09.2026 למסלול "הורה רושם בשם ילד" (ר'
-- self_service_cancellation_and_booking_gate.sql, פונקציית member_can_book) —
-- המיגרציה הזו משלימה את אותו תיקון גם למסלול המאמן.
--
-- חשוב: התוספת (member_can_book) חלה רק על WITH CHECK (הכנסת/עדכון שורה חדשה)
-- ולא על USING (קריאה/מחיקה) — כדי שמאמן/מנהל עדיין יוכל להסיר (DELETE) רישום
-- קיים של מתאמן שהמנוי שלו הפך ללא-פעיל אחרי שכבר נרשם (removeRegistration
-- ב-TodayClasses.jsx) — לא רוצים לחסום ניקוי טעויות.

drop policy if exists class_registrations_write on public.class_registrations;
create policy class_registrations_write on public.class_registrations
  using (
    ((auth.uid() = athlete_id) and public.current_user_can_book())
    or (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'trainer'))
  )
  with check (
    ((auth.uid() = athlete_id) and public.current_user_can_book())
    or (
      exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'trainer')
      and public.member_can_book(athlete_id)
    )
  );
