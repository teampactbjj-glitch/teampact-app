# אפיון: הורה אחד עם כמה ילדים (Guardian / Multi-Child)

**תאריך:** 18.06.2026
**גרסה:** טיוטה לאישור דודי
**גישה שנבחרה:** גישה א' — חשבון התחברות אחד להורה, כמה רשומות ילדים מתחתיו, מתג החלפה באפליקציה.

---

## 1. מטרה

הורה נרשם **פעם אחת** (אימייל + סיסמה אחת), יכול לרשום **כמה ילדים** בטופס ההרשמה, ובתוך האפליקציה יש **כפתור החלפה** בין הילדים כדי להירשם לאימונים / לראות נוכחות / חגורות לכל ילד בנפרד.

**לא נדרש אימייל נפרד או סיסמה נפרדת לכל ילד** — כי לילדים אין חשבון התחברות משלהם; הם רשומות שמקושרות לחשבון ההורה.

---

## 2. ארכיטקטורה קיימת (מה שמצאתי בבדיקה)

- שתי טבלאות: `profiles` (זהות התחברות, `id = auth.uid`) ו-`members` (רשומת המתאמן).
- מתאמן מתחבר עם **אימייל + סיסמה** (`signInWithPassword`). לא anon/טלפון (זה legacy).
- האפליקציה **כבר מנותקת חלקית**: `AthleteDashboard` טוען `member` לפי id ועובד עם `athleteId = member?.id || profile.id` בכל מקום שנוגע בנוכחות/הרשמות. → רוב הקוד יעבוד אוטומטית כשנחליף את ה-`member` הפעיל.
- **RLS (מעודכן אחרי phase-2, 5.5.2026):** קריאה+כתיבה של `checkins`, `class_registrations`, `product_requests` נעולות ל-`athlete_id = auth.uid()`. מאמן/מנהל רואים הכל דרך `is_approved_trainer()` / `is_approved_admin()`.

**משמעות:** כדי שההורה יראה/יכתוב נתוני ילד (ש-`member.id ≠ auth.uid`), צריך להוסיף הרשאת אפוטרופוס לכל ה-policies האלה. כולן תוספת `OR` — לא שכתוב.

---

## 3. שינוי מסד הנתונים (DB)

### 3.1 עמודה חדשה
```sql
ALTER TABLE members ADD COLUMN IF NOT EXISTS guardian_id uuid REFERENCES auth.users(id);
COMMENT ON COLUMN members.guardian_id IS 'חשבון ההורה (auth.users.id) שמנהל את המתאמן הקטין; NULL לבוגרים עצמאיים';
CREATE INDEX IF NOT EXISTS idx_members_guardian ON members(guardian_id);
```
- Nullable, default NULL → **כל הרשומות הקיימות לא מושפעות** (אפס רגרסיה).

### 3.2 פונקציית עזר — "האם המשתמש המחובר הוא האפוטרופוס של המתאמן הזה?"
```sql
CREATE OR REPLACE FUNCTION public.is_guardian_of(p_member_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM members m
    WHERE m.id = p_member_id
      AND m.guardian_id = auth.uid()
  );
$$;
```

### 3.3 הרחבת ה-RLS (תוספת OR לכל policy עצמי)
לכל אחת מהטבלאות `checkins`, `class_registrations`, `product_requests` — להוסיף policy חדש שמתיר לאפוטרופוס. דוגמה ל-`class_registrations`:
```sql
-- קריאה: ההורה רואה את הרשמות הילדים שלו
CREATE POLICY "class_reg_select_guardian" ON public.class_registrations
  FOR SELECT TO authenticated
  USING (public.is_guardian_of(athlete_id));

-- כתיבה: ההורה רושם/מבטל לילדים שלו
CREATE POLICY "class_reg_write_guardian" ON public.class_registrations
  FOR ALL TO authenticated
  USING (public.is_guardian_of(athlete_id))
  WITH CHECK (public.is_guardian_of(athlete_id));
```
אותו דפוס בדיוק עבור:
- `checkins` (select + write) — כדי שצ'ק-אין אוטומטי של הילד יעבוד דרך ההורה.
- `product_requests` (select + insert + delete) — הרשמה לסמינרים/חנות עבור ילד.

> **קריטי לבדיקה:** אם נשכח את הרחבת הכתיבה ל-`class_registrations`, ההורה ילחץ "הירשם" וכלום לא יקרה (כשל שקט). יש לזה תקדים מתועד ב-MEMORY (אותו דפוס קרה עם checkins). → בדיקת הרשמה לכל ילד בנפרד היא חובה לפני דחיפה.

---

## 4. טופס הרישום (`RegisterPage.jsx`)

זרימה חדשה כשהורה רושם ילדים:
1. ההורה ממלא את פרטיו (שם הורה, **אימייל + סיסמה — פעם אחת**, טלפון).
2. ממלא פרטי ילד 1 (שם, תאריך לידה, סניף, סוג מנוי).
3. כפתור **"➕ הוסף עוד ילד"** → טופס ילד נוסף. אין הגבלה על מספר הילדים.
4. שליחה:
   - **`signUp` אחד בלבד** (חשבון ההורה) — זה המפתח שמונע אימייל כפול.
   - לכל ילד → `INSERT` ל-`members` עם `guardian_id = parentUserId`, `parent_name = <שם ההורה>`, `status='pending'`.
   - אם ההורה עצמו מתאמן — אפשר גם רשומת member לעצמו (`id = parentUserId`). אם לא — אין לו רשומת member, רק חשבון אפוטרופוס.

**מצב "הורה לא מתאמן בעצמו":** נוסיף צ'קבוקס "אני רק רושם/ת את ילדיי (לא מתאמן/ת בעצמי)". אם מסומן — לא נוצרת רשומת member להורה.

### 4.1 הוספת ילד מתוך האפליקציה (בהמשך) — תרחיש עיקרי

הורה שכבר משתמש באפליקציה עם ילד אחד יכול להוסיף ילד נוסף **מבפנים**, בלי לעבור שוב דרך טופס ההרשמה.

- הוא כבר מחובר → אין `signUp`. רק `INSERT` ל-`members` עם `guardian_id = auth.uid()`, `status='pending'`, `parent_name` כמו הקיים.
- **תכונה חשובה למשתמשים קיימים:** הילד הקיים נרשם בעבר כך ש-`member.id = auth.uid` (`guardian_id` ריק). הילד החדש מקבל `guardian_id = auth.uid`. שאילתת הטעינה `.or(id.eq.<uid>,guardian_id.eq.<uid>)` מחזירה את **שניהם** → **אין צורך לגעת/לשנות את רשומת הילד הקיים**. אפס סיכון רגרסיה לילד הקיים.
- **RLS נדרש (policy חדש):**
```sql
CREATE POLICY "members_insert_guardian_child" ON members
  FOR INSERT TO authenticated
  WITH CHECK (guardian_id = auth.uid() AND status = 'pending');
```
- **UI:** כפתור "➕ הוסף ילד" בתוך מתג ההחלפה / אזור הפרופיל → טופס קצר (שם, תאריך לידה, סניף, מנוי) → רשומת ילד `pending` → התראה למאמן → אישור → הילד מופיע במתג. עד אישור — מוצג עם תגית "ממתין לאישור".

---

## 5. האפליקציה (`App.jsx` + `AthleteDashboard.jsx`)

### 5.1 טעינת כל ה"מתאמנים" של החשבון
היום `fetchMyClasses` טוען member יחיד לפי `id`. נחליף ל:
```js
// כל הרשומות שהמשתמש המחובר מורשה להן: שלו (id=auth.uid) + ילדיו (guardian_id=auth.uid)
const { data: myMembers } = await supabase.from('members')
  .select('*')
  .or(`id.eq.${userId},guardian_id.eq.${userId}`)
```
- אם רשומה אחת → התנהגות זהה להיום (אין שינוי למתאמן רגיל).
- אם יותר מאחת → מציגים מתג החלפה.

### 5.2 "מתאמן פעיל" (activeMember)
- state חדש: `activeMemberId` (נשמר ב-`localStorage` כדי לזכור את הבחירה).
- כל מקום שהיום משתמש ב-`member` → ישתמש ב-`activeMember` (הילד הנבחר).
- ~6 מקומות שמשתמשים ב-`profile.id` ישירות (כולם `product_requests`: שורות ~629, 659, 1011, 1051, 1321, 1489) → יעברו ל-`activeMember.id`.

### 5.3 מתג ההחלפה (UI)
- אם יש >1 מתאמן: סרגל/תפריט למעלה עם שמות הילדים (+ ההורה אם הוא מתאמן). לחיצה מחליפה `activeMemberId` מיידית, בלי התחברות מחדש.
- אם יש בדיוק 1: לא מוצג כלום (זהה להיום).

---

## 6. צד המאמן/מנהל

- **לא נשבר.** ילדים הם רשומות `members` רגילות → מופיעים אוטומטית ברשימת המתאמנים, בנוכחות, ובאישורי הצטרפות. זו התנהגות נכונה.
- אפשרי לעתיד (לא חובה לגרסה ראשונה): להציג למאמן "👨‍👩‍👧 אח/אחות" ליד ילדים מאותו `guardian_id`.

---

## 7. משתמשים קיימים שכבר רשמו 2 ילדים בנפרד

- הם נשארים עובדים כרגיל (כל אחד חשבון נפרד) — אפס רגרסיה.
- **שלב ב' (לא חובה לגרסה ראשונה):** מסך "קשר ילד קיים" שמאחד תחת `guardian_id` בדיעבד. נדחה אלא אם דודי רוצה אותו מההתחלה.

---

## 8. סיכונים ואיך מנטרלים

| סיכון | חומרה | נטרול |
|-------|--------|--------|
| הרשמה לאימון נכשלת בשקט (RLS כתיבה חסר) | גבוהה | בדיקת הרשמה+ביטול לכל ילד ב-staging |
| דליפת מידע בין משפחות (`is_guardian_of` שגוי) | גבוהה | בדיקה: הורה א' לא רואה ילד של הורה ב' |
| שבירת מתאמן רגיל (חשבון יחיד) | בינונית | נתיב "רשומה אחת" זהה להיום; בדיקה |
| אימייל כפול (signUp לכל ילד) | בינונית | signUp אחד בלבד; השאר INSERT |
| נתונים קיימים | נמוכה | guardian_id nullable; גיבוי DB לפני |

---

## 9. סביבת בדיקה (staging) — תנאי מקדים

**הבעיה:** `.env.local` מצביע על DB הפרודקשן. אסור להריץ את מיגרציית guardian_id על פרודקשן לפני בדיקה.

**הפתרון:** פרויקט Supabase שני (`teampact-staging`), חינמי. דודי פותח אותו (2 דק'), Claude מחבר + מריץ סכמה + נתוני דמה.

צעדים — ראה סעיף "צעדי הקמה" בתשובה בצ'אט.

---

## 10. הערכת זמן (מעודכנת אחרי ממצאי phase-2)

| חלק | זמן |
|------|-----|
| הקמת staging (חד-פעמי) | 2–3 שעות |
| DB: guardian_id + is_guardian_of + RLS (כ-7 policies) | יום |
| טופס רישום: "הוסף עוד ילד" + signUp אחד | חצי–יום |
| אפליקציה: activeMember + מתג + תיקון 6 שימושי profile.id | 1.5 ימים |
| בדיקות (הרשמה לכל ילד, בידוד בין משפחות, מתאמן רגיל, בוגרים) | יום |
| **סה"כ פיתוח** | **~4 ימי עבודה** |

---

## 11. סדר ביצוע (לפי הפרוטוקול)

1. ✅ אפיון (המסמך הזה) — אישור דודי.
2. הקמת staging (Supabase שני).
3. מיגרציית DB על staging → אימות שאין רגרסיה לבוגרים.
4. קוד: טופס רישום + אפליקציה, מול staging.
5. בדיקות מלאות ב-staging (כל 4 הממשקים + בידוד משפחות).
6. רק אחרי "עובד נקי" → מיגרציית DB על פרודקשן (עם גיבוי) → דחיפת קוד ל-main.
