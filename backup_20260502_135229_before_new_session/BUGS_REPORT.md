# דוח סקירת באגים - אפליקציית TeamPact

**תאריך:** 2 במאי 2026
**היקף:** כל קוד הפרויקט (React + Supabase) - שלושת הממשקים: מתאמן, מאמן, מנהל

---

## סיכום מנהלים

נסקרו ~25 קבצי קוד + 14 קבצי SQL migrations. נמצאו **למעלה מ-60 בעיות**, מתוכן **9 קריטיות** הדורשות תיקון מיידי.

**הממצא החמור ביותר:** הסתמכות על סינון בצד הלקוח (frontend) במקום על RLS חזק בצד השרת. כל מאמן רגיל יכול היום לבצע פעולות מנהל דרך DevTools/קונסול - כולל אישור עצמי כמנהל.

---

## חלק 1: באגים קריטיים (חובה לתקן מיידית)

### 1.1 הסלמת הרשאות - מאמן יכול להפוך לעצמו למנהל
**קובץ:** `src/lib/migration-coach-approval.sql:74-81`
**חומרה:** קריטי מאוד (Privilege Escalation)

הפוליסה `profiles_update` חסרה `WITH CHECK`. מאמן רגיל יכול להריץ דרך DevTools:
```sql
UPDATE profiles SET is_admin=true, is_approved=true WHERE id = auth.uid()
```
ולהפוך לעצמו למנהל. זוהי הפרצה החמורה ביותר.

**תיקון:** להוסיף `WITH CHECK` שמונע שינוי `is_admin`/`is_approved` ע"י המשתמש עצמו, או trigger BEFORE UPDATE שמחזיר את הערכים הישנים.

---

### 1.2 דליפת PII - חשיפת כל המתאמנים ל-anon
**קבצים:** `src/lib/migration-rls.sql:100-101`, `migration-phone-login.sql:29-32`
**חומרה:** קריטי

ה-policy `members_select_anon` מוגדרת `FOR SELECT USING (true)` ל-anon. עם ה-anon key (חשוף ב-`supabase.js`), כל אדם יכול למשוך עם curl פשוט את **כל** רשימת המתאמנים: שמות, טלפונים, מיילים, סוגי מנוי, סניפים - גם בלי להיות מחובר.

**תיקון:** להחליף ב-RPC ייעודי `lookup_member_by_phone(text)` עם `SECURITY DEFINER` שמחזיר רק את השדות המינימליים הנדרשים.

---

### 1.3 RLS לא בודק `is_admin` בפעולות מנהל
**קובץ:** `src/lib/migration-coach-approval.sql:38-64`
**חומרה:** קריטי

הפוליסות `members_all_trainer`, `announcements_write`, `coaches_write`, `classes_write` בודקות רק `role='trainer' AND is_approved=true`. כל מאמן רגיל יכול:
- לאשר את עצמו ככשיר ב-`coaches`
- למחוק מתאמנים (טריגר Cascade ימחק את חשבון ה-Auth!)
- לערוך/למחוק announcements של אחרים
- לאשר/לדחות שיעורים

**תיקון:** policies נפרדות עם `is_admin = true` לפעולות גלובליות.

---

### 1.4 טבלת `profile_change_requests` ללא RLS
**קובץ:** `src/lib/migration-profile-change-branches.sql`
**חומרה:** קריטי

הטבלה לא מוגדרת במיגריישנים שסופקו, אין `ENABLE RLS` ואין policies. המתאמן יכול לאשר את הבקשה של עצמו לשינוי סוג מנוי/סניפים.

**תיקון:** להוסיף migration עם:
```sql
ALTER TABLE profile_change_requests ENABLE ROW LEVEL SECURITY;
-- INSERT רק למתאמן עצמו
-- UPDATE (אישור/דחייה) רק לאדמין
```

---

### 1.5 השתלטות חשבון דרך עדכון `members.id`
**קובץ:** `src/components/athlete/AthleteDashboard.jsx:1093-1107`
**חומרה:** קריטי

ב-`fetchMyClasses`, אם המתאמן לא נמצא ב-`members` לפי `id`, הקוד מחפש לפי `email` ועושה `UPDATE members.id = profile.id`. תוקף יכול:
1. להירשם עם email של מתאמן ותיק קיים
2. להיכנס - הקוד יחליף את ה-id של המתאמן הוותיק
3. **גישה מלאה להיסטוריה, מנוי, ורישומים שלו**

**תיקון:** להעביר את לוגיקת הקישור ל-RPC server-side עם בדיקת בעלות, או לחסום ב-RLS.

---

### 1.6 `member_classes_insert/delete` פתוח לחלוטין ל-anon
**קובץ:** `src/lib/migration-rls.sql:124-134`
**חומרה:** קריטי

`WITH CHECK (true)` ו-`USING (true)` - כל אחד יכול ליצור או למחוק רישום של *כל* מתאמן ל-*כל* שיעור. גם המיגריישן `migration-pending-member-gate.sql` לא מתקן זאת (`auth.uid() IS NULL` עוקף את `current_user_can_book()`).

**תיקון:** RPC עם אימות מספר טלפון לרישומי anon, או לדרוש auth מלא.

---

### 1.7 הפרת Rules of Hooks ב-App.jsx
**קובץ:** `src/App.jsx:22-24`
**חומרה:** קריטי (אפליקציה תקרוס בעדכוני React עתידיים)

שלוש שורות `if (...) return ...` ממוקמות **לפני** קריאות ה-`useEffect` (שורה 26+). זו הפרה ישירה של Rules of Hooks - מספר ההוקים שונה בין רנדרים. ב-React 19 + Compiler זה ישבור את האפליקציה.

**תיקון:** להעביר את הניתוב הזה לאחרי כל ה-Hooks, או להשתמש ב-react-router-dom.

---

### 1.8 `bug` במחיקת רישומים - מחיקת היסטוריה
**קובץ:** `src/components/athlete/ClassSchedule.jsx:166-171`
**חומרה:** קריטי

ב-DELETE לאחר ביטול רישום אין `eq('week_start', ...)`. כל רישום היסטורי של אותו (athlete, class) יימחק - **נתוני נוכחות והיסטוריה נמחקים**.

**תיקון:** להוסיף `.eq('week_start', getWeekStart())` למחיקה.

---

### 1.9 ErrorBoundary לא בשימוש
**קובץ:** `src/main.jsx`
**חומרה:** קריטי (UX)

קיימת קומפוננטת `ErrorBoundary` בפרויקט אך **היא לא נכללת בעץ הקומפוננטות**. בכל קריסה - המשתמש מקבל מסך לבן.

**תיקון:** לעטוף `<App />` ב-`<ErrorBoundary>` ב-main.jsx.

---

## חלק 2: באגים בחומרה גבוהה

### 2.1 חוסר עקביות בערכי `status` של members
- `AthleteManagement.saveAthlete` משתמש ב-`'approved'`
- `LeadsManager.approveLead` משתמש ב-`'active'`
- מתאמן שאושר דרך LeadsManager לא יזוהה כ"מאושר" בזרמים אחרים. **מתאמנים נעלמים בין מסכים**.

**תיקון:** קובץ קבועים מרכזי `MEMBER_STATUS = { APPROVED: 'approved', ... }`.

### 2.2 ProfileChangeRequests מוצג למאמן רגיל
**קובץ:** `src/components/trainer/TrainerDashboard.jsx:284-291`

הקומפוננטה מורנדרת תחת `requestsCount > 0` בלבד - לא תחת `isAdmin`. מאמן רגיל פותח טאב athletes ויראה ויאשר בקשות שינוי פרופיל.

**תיקון:** `{isAdmin && requestsCount > 0 && <ProfileChangeRequests />}`.

### 2.3 race condition ב-`approveTrainer` ללא טרנזקציה
**קובץ:** `src/components/trainer/CoachesManager.jsx:91-148`

UPDATE ל-profiles + INSERT/UPDATE ל-coaches בלי טרנזקציה. אם נכשל באמצע - מצב לא-עקבי (מאמן מאושר ללא שיוך לסניף).

**תיקון:** RPC עם טרנזקציה: `approve_trainer(profile_id, branch_ids[])`.

### 2.4 חישוב weekStart שגוי בקצוות זמן
**קבצים:** `AthleteDashboard.jsx:989-994`, `ClassSchedule.jsx:14-19`

משתמש ב-`new Date()` ו-Locale מקומי. בליל שבת-ראשון, לקוח/שרת יקבלו week_start שונה אם זמני המכשיר לא מסונכרנים. רישומים יעלמו/ייכפלו.

**תיקון:** להעביר חישוב week_start ל-server (RPC עם `now()`).

### 2.5 `nextOccurrenceThisWeek` מחזיר תאריך בעבר
**קובץ:** `src/components/athlete/AthleteDashboard.jsx:155-162`

`diff = dow - todayDow` יכול להיות שלילי. שיעור ביום ראשון נראה כ"הסתיים" כשהיום שלישי. **לא ניתן לבטל רישומים שהמערכת חושבת שעברו**.

**תיקון:** להשתמש ב-`computeNextOccurrence` שכבר קיים ב-ClassSchedule.

### 2.6 ניהול הרשאות חסר ב-`AthleteManagement`
**קובץ:** `src/components/trainer/AthleteManagement.jsx`

פונקציות `approveDeletion`, `approvePending`, `rejectPending`, `bulkDeleteAthletes` לא בודקות `isAdmin` או בעלות בסניף לפני הפעולה. מאמן יכול לקרוא מ-DevTools:
```js
supabase.from('members').update({status:'pending_deletion'}).eq('id','<id-של-מתאמן-בסניף-אחר>')
```

**תיקון:** הוספת `if (!isAdmin) return` ובדיקת קיום ב-state המסונן + RLS חזק.

### 2.7 race condition ב-ServiceWorker register
**קובץ:** `src/App.jsx:37-65`

ה-Promise של `register` יכול להיפתר **אחרי** ה-cleanup של useEffect (StrictMode). אז `intervalId`/`onVis` נוצרים ללא ניקוי - דליפת זיכרון.

**תיקון:** דגל `let cancelled = false` ב-effect, בדיקה לפני יצירת ה-interval.

### 2.8 `is_approved=null` נחשב כ"מאושר"
**קובץ:** `src/App.jsx:138, 188`

`profile?.is_approved !== false` בודק רק אם הערך הוא `false` בדיוק. מאמן חדש עם `null` עובר אל TrainerDashboard - **סיכון אבטחה**.

**תיקון:** `DEFAULT FALSE` ב-DB + שינוי ל-`profile?.is_approved !== true`.

### 2.9 `ImportAthletes` ללא בדיקת branch בעלות
**קובץ:** `src/components/trainer/ImportAthletes.jsx:159-185`

מאמן רואה את כל הסניפים שאינם hidden (לא רק שלו) ויכול לייבא מתאמנים לסניף שאינו שלו.

**תיקון:** סינון `branches` לפי `coaches.user_id=trainerId` כשלא admin.

### 2.10 קובץ RegisterPage כפול ופגום
**קובץ:** `src/components/auth/RegisterPage.jsx` (לא משומש כיום)

יוצר רשומות `members` בלי auth user. אם import כלשהו יחזיר אותו לשימוש - back-door.

**תיקון:** בכפוף לאישורך - מחיקת הקובץ (אני לא אמחק ללא אישור מפורש לפי כללי ה-CLAUDE.md).

### 2.11 שיעורים pending נשלחים כ-push
**קובץ:** `src/components/trainer/TodayClasses.jsx:615-624`

כשמאמן יוצר שיעור (status=pending), נשלח push לכל המאמנים. שיעור עוד לא אושר - מבלבל.

**תיקון:** push רק אחרי אישור.

### 2.12 `DEBUG console.log` בפרודקשן
**קבצים מרובים:** `AthleteDashboard.jsx`, `ProductRequests.jsx:19`, `ShopManager.jsx:191,345`, `TrainerDashboard.jsx`, `RegisterCoachPage.jsx:133`

console.log עם `profile.id`, `email`, `role`, payloads - חשיפה ב-DevTools של מי שיש לו גישה.

**תיקון:** עטיפה ב-`if (import.meta.env.DEV)` או הסרה.

---

## חלק 3: באגים בחומרה בינונית

### 3.1 הצגת `error.message` ישיר ל-user
מהודעות postgres יכולות לחשוף שמות עמודות, סכמת DB ו-RLS rules.
**תיקון:** הודעה default ידידותית, log מפורט רק ב-DEV.

### 3.2 polling כל 5 שניות ללא backoff
ב-App.jsx, גם כשהטאב מינימזה. עומס מיותר על Supabase.
**תיקון:** Realtime channels או backoff + עצירה ב-`document.hidden`.

### 3.3 `ilike` עם input משתמש בלי escape
ב-TodayClasses.jsx:540. תווי `%`/`_` מתפרשים כ-wildcards.
**תיקון:** `query.replace(/[%_]/g, '\\$&')`.

### 3.4 race condition ב-`handleRegister`
ב-AthleteDashboard.jsx:1131 - שני קליקים מהירים יכולים לעקוף את `registrations.size >= limit`.
**תיקון:** `setRegistrations(prev => ...)` או guard עם `isRegistering`.

### 3.5 `signUp` ללא rollback
ב-RegisterCoachPage.jsx:86 - אם upsert של profiles נכשל אחרי signUp, נשאר חשבון auth יתום.
**תיקון:** Edge Function שיוצרת בטרנזקציה.

### 3.6 ConfirmProvider - Promise תקוע
שתי קריאות עוקבות ל-`confirm()` משאירות את ה-Promise הראשון לא-resolved לעולם.
**תיקון:** קריאה ל-`state.resolve(false)` לפני state חדש.

### 3.7 focus trap לוקח אלמנטים disabled
ב-Modal.jsx:32 ו-AccessibilityWidget.jsx:82. focus נתקע באלמנטים שלא מוקדים.
**תיקון:** סינון `:not([disabled])` ובדיקת `offsetParent !== null`.

### 3.8 חוסר loading state לכפתורי שמירה
ב-AthleteManagement, TodayClasses, ShopManager - לחיצה כפולה יוצרת רשומות כפולות.
**תיקון:** disabled על כפתור בזמן submit.

### 3.9 חסר `confirm` לפני `deleteItem`
ב-AnnouncementsManager:188 ו-TodayClasses cancelDeletionRequest. מחיקה לצמיתות בלחיצה אחת.
**תיקון:** `useConfirm()` בכל פעולת מחיקה.

### 3.10 שינוי סיסמה ללא דרישת סיסמה נוכחית
ב-TrainerProfile.jsx:24-34. אם הדפדפן פתוח, מישהו יכול לשנות סיסמה.
**תיקון:** דרישת סיסמה נוכחית לפני שינוי.

### 3.11 בעיות בולידציה של טפסים
- אין regex על email ב-RegisterPage
- אין בדיקת `branch_ids.length > 0` ב-saveAthlete
- אין בדיקה על `phone` format
- אין rate limiting על handleOrder

### 3.12 ביטול הזמנה לא בודק `result.count`
מתאמן לוחץ "בטל הזמנה" → DELETE לא מסיר שום שורה (status שונה) → state מקומי משתקר → ההזמנה תחזור ב-fetch.
**תיקון:** בדיקת `result.count`, הצגת שגיאה אם 0.

### 3.13 race conditions ב-fetchAthletes
ב-AthleteManagement.jsx:75-116 - אם `trainerId` משתנה תוך כדי, התוצאה תיקבע עם הפרמטרים הישנים.
**תיקון:** דגל `cancelled` בתחילת הפונקציה.

### 3.14 `Math.min(...empty)` מציג "₪Infinity"
ב-ProductDetail.jsx:147 - כשכל ה-options עם `price=null`.

### 3.15 `requested_branch_id` vs `requested_branch_ids[]`
חוסר עקביות בין הסכמה לקוד. מאמנים שנרשמו לפני המיגריישן רק עם branch יחיד.

### 3.16 missing dependencies ב-useEffect
- TrainerDashboard.jsx:83 - חסר `[isAdmin, profile?.id]`
- TodayClasses.jsx:121 - חסר `[isAdmin]`
- AthleteDashboard.jsx:1035 - dependency על `announcements` יוצר re-runs מיותרים

### 3.17 `redirectTo: window.location.origin` ב-passwordReset
פגיע ל-subdomain takeover. **תיקון:** redirectTo קבוע מ-config.

### 3.18 חוסר טיפול בשגיאות RLS
`ProfileChangeRequests.reload()` קורא load מחדש - איטי. צריך update לוקאלי + רענון ברקע.

### 3.19 Service Worker hash injection
`App.jsx:79-87` - לא מסנן origin של messages. תיאורטית - exploit דרך postMessage.
**תיקון:** `if (e.source === navigator.serviceWorker.controller)`.

### 3.20 שאילתות חסרות `branch` filtering
ב-ClassSchedule.jsx, רישומי מתאמן בסניפים אחרים ימשיכו לתפוס מקום במכסה.

---

## חלק 4: באגים נמוכים / שיפורים

- `notifyTargets.js` - מסנן בצד client במקום ב-DB
- `Toast` בלי תור - הודעות נדרסות
- aria-hidden חסר ב-Modal overlay
- אין retry על `notifyPush` כשנכשל
- subscription_type נופל בחזרה ל-`profile` במקום `member` (source-of-truth)
- הצגת `error.code` הגולמי למשתמש
- `notifyPush` בלי rate limiting - ספאם push
- אין `unique constraint` על `coaches(name, branch_id)` - כפילויות
- focus restoration ב-AccessibilityWidget בעייתי ב-StrictMode
- אין `WITH CHECK` בכמה policies של UPDATE
- `branches` query לא מסתיר hidden ל-non-admins ב-RLS
- `setTimeout` בלולאת ScheduleTab ללא clearTimeout
- ProductDetail useEffect עם eslint-disable של exhaustive-deps

---

## חלק 5: המלצות מבניות

### 5.1 RPC לכל פעולת מנהל
לעטוף את כל פעולות המנהל ב-Postgres functions עם `SECURITY DEFINER` שבודקות `is_admin = true` בפנים. למנוע גישה ישירה לטבלאות הרגישות מ-frontend.

דוגמאות לפונקציות נדרשות:
- `approve_trainer(profile_id, branch_ids[])`
- `reject_trainer(profile_id)`
- `approve_profile_change_request(request_id)`
- `bulk_delete_members(member_ids[])`

### 5.2 Helper Functions בקוד
```js
// src/lib/permissions.js
export function requireAdmin(profile) {
  if (!profile?.is_admin) throw new Error('פעולה זו דורשת הרשאת מנהל');
}
export function requireTrainerForBranch(profile, branchId, allowedBranches) {
  if (profile?.is_admin) return;
  if (!allowedBranches.includes(branchId)) throw new Error('אין הרשאה לסניף זה');
}
```

### 5.3 קבועים מרכזיים
```js
// src/lib/constants.js
export const MEMBER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  PENDING_DELETION: 'pending_deletion',
};
```

### 5.4 לעבור ל-react-router-dom
לפתור את בעיית Rules of Hooks ב-App.jsx ולקבל ניהול ניתוב מקצועי.

### 5.5 ENV variables
להעביר את `supabase.js` להשתמש ב-`import.meta.env.VITE_SUPABASE_URL` ו-`VITE_SUPABASE_ANON_KEY` (כמו שמשמש ב-push.js עבור VAPID).

### 5.6 ErrorBoundary + unhandledrejection
- לעטוף את `<App />` ב-`<ErrorBoundary>`
- להוסיף `window.addEventListener('unhandledrejection', ...)` ב-main.jsx

### 5.7 RLS Audit
לבצע audit מלא על כל הטבלאות:
- `members`, `classes`, `class_registrations`, `member_classes`, `checkins`
- `coaches`, `branches`, `announcements`, `product_orders`, `product_requests`
- `product_variants`, `profiles`, `trial_visits`, `profile_change_requests`

לכל טבלה לוודא:
- `ENABLE ROW LEVEL SECURITY` דולק
- policies נפרדות ל-SELECT/INSERT/UPDATE/DELETE
- `WITH CHECK` בכל UPDATE/INSERT
- בדיקת `is_admin` היכן שצריך

### 5.8 פונקציות עזר ל-RLS
```sql
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_approved_trainer() RETURNS boolean AS $$
  SELECT COALESCE((SELECT role = 'trainer' AND is_approved
                   FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```
ואז ב-policies: `USING (is_admin() OR is_approved_trainer())`.

---

## חלק 6: סדר עדיפויות לתיקון

### שבוע 1 - קריטי לאבטחה (חובה!)
1. תיקון `profiles_update` עם `WITH CHECK` (סעיף 1.1)
2. RLS חזק על `profile_change_requests` (סעיף 1.4)
3. צמצום `members_select_anon` ל-RPC (סעיף 1.2)
4. הוספת `is_admin = true` לפעולות מנהל ב-RLS (סעיף 1.3)
5. תיקון `member_classes_insert/delete` (סעיף 1.6)
6. תיקון השתלטות חשבון (סעיף 1.5)
7. תיקון מחיקת רישומים היסטוריים (סעיף 1.8)

### שבוע 2 - יציבות אפליקציה
8. תיקון Rules of Hooks ב-App.jsx (סעיף 1.7)
9. הוספת ErrorBoundary (סעיף 1.9)
10. תיקון race condition ב-ServiceWorker (סעיף 2.7)
11. תיקון `is_approved=null` (סעיף 2.8)
12. אחידות ב-`status` של members (סעיף 2.1)

### שבוע 3 - הרשאות והגיון עסקי
13. הוספת בדיקות `isAdmin` ב-frontend functions (סעיף 2.6)
14. הסתרת `<ProfileChangeRequests>` ל-non-admin (סעיף 2.2)
15. תיקון `nextOccurrenceThisWeek` (סעיף 2.5)
16. RPC עם טרנזקציה ל-approveTrainer (סעיף 2.3)
17. תיקון weekStart UTC (סעיף 2.4)

### שבוע 4+ - שיפורים
18. הסרת `console.log` (סעיף 2.12)
19. ולידציות טפסים (סעיף 3.11)
20. loading states + confirms (סעיפים 3.8, 3.9)
21. שיפור focus management (סעיף 3.7)
22. שאר השיפורים בחלק 3-4

---

**הערה חשובה:** לא ביצעתי שינויים בקוד. הדוח מתעד בלבד את הממצאים. בקש ממני אילו תיקונים להתחיל ובאיזה סדר, ונתחיל מהקריטיים.

**מסר אישי:** המערכת עובדת אבל יש בה פרצות אבטחה משמעותיות. אם יש לך מאמנים שאתה לא סומך עליהם 100% - אני ממליץ לתקן את סעיפים 1.1-1.6 ב-72 שעות הקרובות. תוקף שמכיר Supabase יוכל לנצל את זה.
