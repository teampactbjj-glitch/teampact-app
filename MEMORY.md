# MEMORY - TeamPact App

> **🆕 עדכון 02.05.2026 (המשך) — תיקון "סלייד באמצע המסך" גם בממשק מאמן**
>
> **מה תוקן עכשיו:** התיקון של scrollbar/סלייד באמצע המסך ב-desktop הוחל גם על `TrainerDashboard.jsx` (שורות 271-316). לפני: `<main className="flex-1 overflow-y-auto p-4 max-w-3xl w-full mx-auto">` — main עצמו צר ולכן הסקרולבר באמצע. עכשיו: `<main className="flex-1 overflow-y-auto">` ברוחב מלא, והתוכן עטוף ב-`<div className="p-4 max-w-3xl w-full mx-auto">`. כך הסקרולבר חוזר לקצה המסך גם בטאב **פרופיל** וגם בטאב **מתאמנים** (ובכל הטאבים האחרים של המאמן/מנהל).
>
> **עברנו build ב-vite — הצליח** (97 modules, ללא שגיאות).
>
> **טרם נדחף לפרודקשן** — לדחוף יחד עם התיקון של AthleteDashboard.jsx (ראה משימה 2 למטה).
>
> ⚠️ **My last pending task** מוגדר בסעיף "Session 02.05.2026" למטה. **קרא אותו ראשון.**
>
> 📁 גיבויים זמינים: `backup_20260502_100509/` (לפני סקירה), `backup_20260502_135229_before_new_session/` (לפני שיחה חדשה)
> 📄 דוח באגים מלא: `BUGS_REPORT.md` בשורש הפרויקט

---

# 📅 Session 02.05.2026 — סקירת באגים מקיפה + תיקוני קריסה

## הקשר ומה קרה

המשתמש ביקש סקירה יסודית של כל הקוד עם דגש על שלושת הממשקים (מתאמן/מאמן/מנהל) והרשאות.

### ✅ מה הושלם בסשן הזה

**1. סקירת באגים מקיפה (BUGS_REPORT.md):**
- נסקרו ~25 קבצי קוד + 14 קבצי SQL migrations
- נמצאו **למעלה מ-60 בעיות**, מתוכן **9 קריטיות**
- הדוח המלא נשמר ב-`/Users/dudibenzaken/teampact-app/BUGS_REPORT.md`

**2. תיקון משבר "מסך שחור" (Production Crash):**
- **הבעיה:** `Uncaught ReferenceError: effectiveCount is not defined` בפרודקשן ב-Vercel
- **הסיבה:** ב-commit הקודם (`4b220ca`) `effectiveCount` הוגדר ב-`AthleteDashboard` (שורה 1028) אבל משומש ב-`ScheduleTab` (שורות 219, 281). פונקציה נפרדת = לא רואה את המשתנה.
- **התיקון (כבר קיים בקוד הלוקאלי שלך):** העברת `effectiveCount` + `effectiveCountNext` לתוך `ScheduleTab`, העברה כ-props של `registrations`/`registrationsNext`.
- **נדחף לפרודקשן** (commit חדש שכלל גם 11 קבצים אחרים).

**3. תיקון "סלייד באמצע המסך" ב-desktop:**
- **הבעיה:** scrollbar של `<main>` הופיע באמצע המסך כי main היה `max-w-lg mx-auto` עם `overflow-y-auto`
- **התיקון:** main עכשיו רוחב מלא, התוכן הפנימי ב-`<div className="p-4 max-w-lg w-full mx-auto">`. קובץ: `src/components/athlete/AthleteDashboard.jsx:1394-1406`
- **טרם נדחף לפרודקשן** ⚠️

**4. גיבויים שנוצרו:**
- `backup_20260502_100509/` — לפני התחלת התיקונים
- `backup_20260502_135229_before_new_session/` — לפני סוף השיחה

### 🔄 שינויים שנעשו ובוטלו (חזרה לאחור)

ניסיתי בתחילת הסשן להוסיף את התיקונים הבאים, אבל **שיחזרתי אותם אחרי שהמשתמש דיווח על מסך שחור** (התברר אחר כך שהמסך השחור היה באג ישן ולא קשור לתיקונים שלי). אלה תיקונים שעדיין צריך להחיל:
- ❌ ErrorBoundary ב-main.jsx
- ❌ Rules of Hooks ב-App.jsx
- ❌ is_approved=null נחשב לא-מאושר
- ❌ DELETE רישומים עם week_start ב-ClassSchedule.jsx (חלק תוקן ע"י המשתמש קודם)

---

## ⏳ My last pending task

המשתמש ביקש להמשיך בשיחה חדשה לתיקון שאר הבאגים. **לפני שמתחילים בשיחה החדשה, יש שתי משימות פתוחות:**

### 🔴 משימה 1 — להריץ migration ב-Supabase (חובה!)

**הרישום נכשל בפרודקשן** כי הקוד מצפה ל-constraint חדש שלא קיים ב-DB.

**איך להריץ:**
1. Supabase Dashboard → SQL Editor → New Query
2. הדבק את התוכן של `supabase/migrations/class_registrations_per_week.sql`
3. לחץ Run

```sql
-- נמצא ב-supabase/migrations/class_registrations_per_week.sql
-- מסיר את ה-UNIQUE הישן על (athlete_id, class_id)
-- ומוסיף UNIQUE על (athlete_id, class_id, week_start)
-- + שני indexes עבור ביצועים
```

### 🟡 משימה 2 — דחיפת תיקון scrollbar ל-Vercel

```bash
cd /Users/dudibenzaken/teampact-app
git add src/components/athlete/AthleteDashboard.jsx MEMORY.md
git commit -m "fix(athlete): scrollbar at viewport edge on desktop + memory update"
git push origin main
```

---

## 📋 רשימת הבאגים שעוד נשארו לתקן (בסדר עדיפות)

### 🔥 קריטי - אבטחה (חובה לתקן בהקדם)

| # | בעיה | קובץ | פעולה |
|---|---|---|---|
| 1 | מאמן יכול להפוך לעצמו ל-`is_admin=true` (חסר WITH CHECK) | `migration-coach-approval.sql:74-81` | יצירת migration חדש עם WITH CHECK |
| 2 | `members_select_anon` חושף את כל המתאמנים ל-anon | `migration-rls.sql:100-101` | RPC ייעודי לחיפוש לפי טלפון |
| 3 | RLS לא בודק `is_admin` בפעולות מנהל | `migration-coach-approval.sql:38-64` | policies נפרדות עם is_admin=true |
| 4 | טבלת `profile_change_requests` ללא RLS | (חסר migration) | יצירת migration חדש |
| 5 | השתלטות חשבון דרך עדכון `members.id` | `AthleteDashboard.jsx:1093-1107` | RPC server-side עם בדיקת בעלות |
| 6 | `member_classes` פתוח לחלוטין ל-anon | `migration-rls.sql:124-134` | תיקון policies |

### ⚠️ גבוה - יציבות

| # | בעיה | קובץ | פעולה |
|---|---|---|---|
| 7 | הפרת Rules of Hooks ב-App.jsx | `App.jsx:22-24` | להעביר את ה-routing לפני App() function |
| 8 | ErrorBoundary לא בשימוש (מסך לבן בקריסה) | `main.jsx` | לעטוף `<App />` ב-ErrorBoundary |
| 9 | `is_approved=null` נחשב מאושר | `App.jsx:138, 188` | החלפה ל-`!== true` |
| 10 | חוסר עקביות ב-status של members ('approved' vs 'active') | מספר קבצים | קובץ קבועים מרכזי |
| 11 | `ProfileChangeRequests` מוצג למאמן רגיל | `TrainerDashboard.jsx:284-291` | עטיפה ב-`{isAdmin && ...}` |
| 12 | race condition ב-`approveTrainer` | `CoachesManager.jsx:91-148` | RPC עם טרנזקציה |
| 13 | חישוב weekStart שגוי בקצוות זמן | `AthleteDashboard.jsx:989-994` | UTC או server-side |
| 14 | `nextOccurrenceThisWeek` מחזיר עבר | `AthleteDashboard.jsx:155-162` | להשתמש ב-`computeNextOccurrence` הקיים |

### 🟢 בינוני - הרשאות UI

| # | בעיה | קובץ |
|---|---|---|
| 15 | חסרי `isAdmin` checks ב-AthleteManagement | `AthleteManagement.jsx` (כמה פונקציות) |
| 16 | `ImportAthletes` ללא בדיקת branch | `ImportAthletes.jsx:159-185` |
| 17 | שיעורים pending נשלחים כ-push | `TodayClasses.jsx:615-624` |
| 18 | console.log בפרודקשן | מספר קבצים |

### 🔵 נמוך - שיפורי UX

- הצגת error.message ישיר ל-user
- polling כל 5 שניות ללא backoff
- ilike עם wildcards לא מסוננים
- חוסר loading states ו-confirms

---

## 🎯 המלצות לסשן הבא

1. **לפני כל פעולה - לוודא שהאפליקציה עובדת** (להריץ את 2 המשימות הפתוחות למעלה)
2. **תיקון אחד בכל פעם** + בדיקה אחרי כל אחד
3. **להתחיל עם תיקוני SQL/RLS** (קריטיים, אבל ב-migrations חדשים בלבד - לא לערוך migrations קיימים)
4. אחר כך - תיקוני React (ErrorBoundary, Rules of Hooks)
5. בסוף - שיפורי UX

**תיקונים מסוכנים שדורשים שיחה ייעודית:**
- אחידות `status` של members (יכול לשבור נתונים קיימים)
- שינויי RLS שעלולים לחסום פעולות לגיטימיות

---

## 🔐 הערת אבטחה

ב-`.git/config` יש GitHub Personal Access Token חשוף. **ממליץ בחום להחליף אותו** ב-https://github.com/settings/tokens אחרי שהאפליקציה תהיה יציבה.

---

## 🔑 כללי עבודה קבועים (חובה לקרוא כל שיחה חדשה)

### כלל #1 — שלושת הממשקים (הוסכם 30.04.2026)
האפליקציה מורכבת מ-**3 ממשקים נפרדים**:
1. **ממשק מתאמן** — `src/components/athlete/AthleteDashboard.jsx`
2. **ממשק מאמן** — `src/components/trainer/TrainerDashboard.jsx` (`isAdmin=false`)
3. **ממשק מנהל** — אותו `TrainerDashboard.jsx` עם `isAdmin=true`

**כל פעם שמתקנים משהו ויזואלי / UX, חובה לוודא שזה תקף לכל שלושת הממשקים:**
- אם הקוד ברכיב משותף (כמו `BottomNav.jsx` או `index.css`) → התיקון אוטומטית גלובלי, אבל עדיין **לבדוק שאין override במסך ספציפי**.
- אם הקוד ספציפי לממשק אחד → להעתיק/להתאים גם לשני האחרים.
- **לעולם לא לסיים תיקון ויזואלי בלי לוודא שכל שלושת הממשקים עובדים.**

הכלל נוצר אחרי באג שתוקן בממשק מנהל אבל המתאמנים המשיכו לראות את הבעיה (סיבה הסתברה: PWA cached, אבל הכלל נשאר מחייב).

### כלל #2 — עקביות דאטה בין ממשקים בעלי אותה הרשאה (הוסכם 02.05.2026)
**אם שני ממשקים אמורים להציג אותו דאטה, הם חייבים לקרוא מאותו מקור (אותה טבלה, אותם פילטרים, אותה לוגיקת עיבוד).**

חוקים פרקטיים:
1. **אותה טבלה לכולם** — אסור שמאמן יקרא מ-`announcements` ומנהל מ-`products` עבור אותה ישות. זה יוצר drift ובלבול.
2. **ההבדל היחיד המותר בין ממשקים** הוא:
   - **סינון לפי הרשאה** (למשל מאמן רגיל רואה רק את הסניף שלו, מנהל את הכל) — אך **דרך אותה שאילתה** עם `.eq()` נוסף.
   - **שדות נוספים** שמנהל רואה ומאמן לא — אך מאותה רשומה.
   - **פעולות נוספות** (אישור/מחיקה) — אך על אותו דאטה מוצג.
3. **תיקון לוגיקת דאטה במנהל ⇒ חובה לבדוק אם זה תקף גם למאמן ולמתאמן.** במיוחד:
   - שינוי שם טבלה / שדה → לעדכן את כל המסלולים שקוראים ממנה.
   - שינוי פילטר (`status`, `deleted_at`, `branch_id`) → לעדכן בכולם.
   - שינוי בחישוב (ספירה, מיזוג, מיון) → לוודא שהמתאמן רואה את אותו חישוב.
4. **ההבדל הלגיטימי בין מאמן למנהל** הוא רק מה שאמור לקרות לפי הרשאה — לעולם לא drift טכני.

הכלל נוצר אחרי דיון על `ShopManager.jsx` שבו חשדו (בטעות) שמאמן ומנהל קוראים מטבלאות שונות. החשד הופרך, אך הוסכם שהכלל עצמו חיוני להגנה עתידית.

---

# 📅 Session 01.05.2026 — Push ידני למתאמנים שלא הגיעו (שלב א׳ הושלם)

## הקשר
ממשיכים ישירות מ-MEMORY של 30.04.2026 — סקציית "מתאמנים שלא הגיעו" ב-`ReportsManager.jsx`.
המשתמש רצה התראות אוטומטיות למתאמנים לא-פעילים. הסכמנו על:
- **סף הזמן: 14 ימים** (לא 7 — להימנע מ-false positives של חופש קצר/מילואים/מחלה).
- **ערוץ ראשי: Push באפליקציה** (חינמי, לא דורש שהמאמן יכיר את המתאמן בווצאפ).
- **ווצאפ נשאר כ-fallback** למתאמנים שלא הפעילו Push.
- **סדר עבודה:** קודם שלב א׳ (Push ידני), אחרי שמוודאים שהטון/קליקים תקינים → שלב ב׳ (cron אוטומטי 09:00).

## מה בוצע (commit pending)

### `src/components/trainer/ReportsManager.jsx`

**1. סף הזמן הוחלף 7 → 14 ימים**
- קבוע חדש: `const INACTIVE_THRESHOLD_DAYS = 14`.
- כותרת הסקציה: "מתאמנים שלא הגיעו מעל **שבועיים**".
- footer ו-empty state עודכנו בהתאם.

**2. Imports חדשים**
```js
import { notifyPush } from '../../lib/notifyPush'
import { useToast, useConfirm } from '../a11y'
```

**3. State חדש בקומפוננטה**
- `pushSending: Set<memberId>` — מי כרגע באמצע שליחה (כדי לחסום קליק כפול).
- `pushSent: Set<memberId>` — מי כבר קיבל בסשן הזה (UI מציג ✓ נשלח).
- `bulkSending: bool` — לכפתור bulk.
- `toast = useToast()` ו-`confirm = useConfirm()` (קומפוננטות a11y קיימות).

**4. שתי פונקציות חדשות**
- `sendPushToMember(member)` — שולחת Push יחיד דרך `notifyPush({ userIds: [id], title, body, url: '/', tag, icon })`. גוף ההודעה מותאם לפי `daysSince` (≤14 = "מתגעגעים", >14 = "X ימים — הכל בסדר?", null = "עוד לא התחלת").
- `sendPushToAllInactive()` — דורש `await confirm(...)` לפני שליחה ל-N מתאמנים. שולחת בשליחות מקבילות עם `Promise.allSettled` (אחד-אחד כי הטקסט שונה, אבל לא חוסם UI). מציגה toast עם success/failed count.

**5. UI חדש בסקציה**
- **כפתור bulk כחול** למעלה: "📲 שלח Push ל-N" + הסבר. רק מוצג כשיש לא-פעילים.
- ליד כל מתאמן — **כפתור Push כחול** (לפני כפתור הווצאפ). מצבים: ברירת מחדל / שולח (`…`) / נשלח (`✓ נשלח`, מושבת).
- כפתור הווצאפ נשאר כ-fallback. אם אין טלפון — `—` במקום הטקסט הקודם "אין טלפון".

**6. footer עודכן**
מסביר את שני הערוצים: Push חינמי + פנימי, ווצאפ fallback למי שלא הפעיל Push.

### Build
```
npx vite build --outDir /tmp/tp-dist --emptyOutDir
✓ 97 modules transformed
✓ built in 1.36s
```
(הסיבה ל-outDir חיצוני: בעיית הרשאות במחיקת `dist/` בסנדבוקס. הקוד עצמו תקין.)

---

## ⚠️ My last pending task — אוטומציה (שלב ב׳)

**מה נשאר:**

### שלב ב׳ — Push אוטומטי יומי ב-09:00
1. **Supabase Edge Function חדשה: `notify-inactive-members`**
   - מיקום: `supabase/functions/notify-inactive-members/index.ts` (לבדוק אם יש כבר תיקיית functions בפרויקט; אם לא — ליצור).
   - שאילתה: `members` שאין להם `class_registrations` עם `week_start >= now() - interval '14 days'`. ב-RLS צריך `service_role`.
   - שליחה: לקרוא ל-Edge Function הקיימת `send-push` (זו שמשמשת את `notifyPush`).
   - לוג: טבלה חדשה `inactive_notifications_log (id, member_id, sent_at, body)` לוודא שלא שולחים פעמיים באותו יום.

2. **Cron trigger — אופציות חינמיות:**
   - **GitHub Actions** (מומלץ): workflow ב-`.github/workflows/notify-inactive.yml` עם `schedule: cron: '0 6 * * *'` (06:00 UTC = 09:00 שעון ישראל בקיץ, 08:00 בחורף — אפשר להחליט אם רוצים בדיוק 09:00 שעון מקומי לכל השנה, אז cron של `0 7 * * *` UTC לחורף).
   - cron-job.org או EasyCron — חיצוני.
   - Supabase pg_cron — דורש Pro.

3. **בדיקות לפני הפעלה:**
   - לרוץ ידנית פעם אחת ולוודא שזה לא מציף 73 אנשים.
   - לבדוק שהלוג רושם.
   - לבדוק שמתאמן שכן נכנס ב-12 הימים האחרונים לא נשלף.

### שלב ג׳ (עתידי, לא דחוף) — צ'אט פנימי דו-כיווני
- טבלת `messages(id, from_id, to_id, body, created_at, read_at)`.
- UI ב-AthleteDashboard + TrainerDashboard (טאב חדש "הודעות").
- שלב Push חד-כיווני נשאר; הצ'אט מאפשר תגובה.
- 1-2 ימי עבודה.

### 🆕 פיצ'ר עתידי — מעקב אוטומטי אחרי שיעורי ניסיון (trial_visits)
**הקשר:** מתאמני ניסיון נמצאים בטבלה נפרדת `trial_visits` (אנונימית — לא ב-`members`). היום אין להם הודעת מעקב אוטומטית.

**מה לבנות:**
1. **טופס נחיתה לאחר אימון ניסיון** — לינק שנשלח למתאמן הניסיון אחרי האימון. בטופס: שם, טלפון, מייל, תשלום על האימון. אופציות מימוש:
   - לינק חיצוני שנפתח בדפדפן (תוך שימוש בטופס הקיים של RegisterPage או בטופס חדש ייעודי).
   - שילוב בטופס הרישום הקיים (`RegisterPage.jsx`) עם פרמטר `?source=trial_followup`.
   - אופציה להחלטה: לאחד עם flow ההרשמה הרגיל או לעשות נפרד (לחשוב אם ניסיון בתשלום שונה ממנוי מלא).
2. **הודעה אוטומטית יום אחרי הביקור** — לפי `trial_visits.visit_date + 1 day`. תוכן:
   - "היי [שם]! 🥋 איך היה האימון אתמול? היו לך שאלות? הצטרפנו על השם שלך לאימון ניסיון — נשמח לראות אותך גם באימון הבא 💪"
   - הלינק לטופס מילוי פרטים+תשלום.
3. **תזמון:** Edge Function נפרדת `notify-trial-followup` שרצה יומית (אותו cron כמו `notify-inactive-members`).
4. **ערוץ:** ווצאפ (כי יש את הטלפון שלהם מהאימון) + מייל אם יש.

**הצעת המשתמש (01.05.2026):** "אפשרי יום אחרי לשלוח כבר הודעה לשאול לשלומו לפי השם שלו. ובאפליקציה אופציה (אולי לינק כמו למתאמנים חדשים או באותו טופס צריך לחשוב על משהו) ששם הם ימלאו פרטים וישלמו על האימון ניסיון. ואז יהיו לנו פרטים שלהם ויום אחרי יקבלו הודעה אוטומטית. תזכור את זה נעשה כשנסיים."

### החלטות ארכיטקטוניות לטרייאל (משיחה 01.05.2026)

**טופס:** **טופס נפרד** `/trial-payment` (ולא לשלב ב-RegisterPage).
- 4 שדות בלבד: שם מלא, טלפון, מייל, תחום אימון.
- CTA יחיד: "שלם ₪X והצטרף לאימון הקרוב".
- לא דורש login.
- בעתיד: כפתור "להפוך למנוי קבוע" שמעביר ל-RegisterPage עם פרטים שכבר מולאו.

**סליקה — המלצה לתחילת הדרך:**
- **Paybox / Bit Business** — 1.5%-2% עמלה, ₪0 דמי שירות, התחברות מהירה. מתאים לנפח נמוך.
- כשמגיעים ל-50+ עסקאות בחודש או רוצים מנוי חודשי אוטומטי — מחליפים ל-**Tranzila / Cardcom** (1.4%-2.2% + ₪30-100 חודשי, אבל תמיכה בכרטיס שמור).
- חישוב לדוגמה (₪80 לניסיון): עמלה ₪1.60 + מע"מ 18% = ~₪1.89 לעסקה.

**Flow מלא:**
1. אימון ניסיון פיזי → מאמן רושם שם+טלפון ב-`trial_visits`.
2. למחרת 09:00 — Edge Function `notify-trial-followup` שולחת ווצאפ אוטומטי עם לינק ייחודי.
3. הלינק מוביל ל-`/trial-payment?ref=ABC123` — שם המתאמן כבר ממולא.
4. אחרי תשלום מוצלח — webhook יוצר רשומה ב-`members` עם `status='trial_paid'` (סטטוס חדש להוסיף).

**שאלות פתוחות להחלטה כשנגיע לפיצ'ר:**
- ספק סליקה (Paybox? Tranzila?).
- מחיר ניסיון (₪50? ₪80? חינם עם הרשמה?).
- אם בחינם — הטופס הופך לטופס הרשמה בלבד, לא תשלום.

### החלטות סליקה + חשבוניות (01.05.2026) — סופי

**מחיר אימון ניסיון: ₪50.**

**גודל פעילות:**
- חולון (Hankin): 300 מתאמנים פעילים. כיום נגבה דרך מזכירות + "החברה לבידור ובילוי" (עמלת ניהול חיצונית של ~10%).
- קאנטרי (יפתח בקרוב): שאיפה ל-100+ מתאמנים. אין מזכירות — דודי לבד.
- אימוני ניסיון: 10-30 בחודש.
- **סה"כ עתידי: ~400 מתאמנים בחיוב חודשי דרך האפליקציה.**

**ההחלטה הסופית: Cardcom + Greeninvoice** (לא Bit, לא Tranzila).

**למה Cardcom?**
- תומך ב**כרטיס שמור (recurring)** — חיוב חודשי אוטומטי למנויים. Bit לא תומך.
- שותפות Native עם Greeninvoice — חשבונית אוטומטית בלי קוד נוסף.
- API מודרני, ממשק נקי, תיעוד מצוין.
- אישור הכרת תוכנה מרשות המיסים.

**למה Greeninvoice?**
- הכי טוב בישראל ל-API (טוקנים, JSON נקי, תיעוד טוב).
- אישור הכרת תוכנה.
- אינטגרציה ישירה עם Cardcom — אפס שורות קוד נוספות.

**אסטרטגיה — קאנטרי קודם, חולון אחר כך:**

**שלב A (קאנטרי, מהיום הראשון):**
- כל מתאמן רושם דרך האפליקציה ומשלם דרך Cardcom (iframe).
- חשבונית במייל אוטומטית.
- Push לדודי על כל תשלום.

**שלב B (חולון, בעוד 3-6 חודשים, אחרי שהמערכת מוכחת):**
- העברה הדרגתית מ"החברה לבידור ובילוי" לאפליקציה.
- כל מי שהמנוי שלו מתחדש — נרשם דרך האפליקציה במקום דרך המזכירות.
- **חיסכון צפוי: ~₪9,000/חודש = ₪108,000/שנה** (העמלה של החברה לבידור ובילוי על 300 מתאמני חולון).

**עלויות חודשיות צפויות בשלב המלא (400 מתאמנים, ממוצע ₪350):**
| בנד | חודשי |
|---|---|
| Cardcom עמלות (1.8%) | ₪2,520 |
| Cardcom דמי שירות | ~₪80 |
| Greeninvoice (תוכנית פלוס, 400+ מסמכים) | ₪199 |
| מע"מ על שירותים | ~₪50 |
| **סה"כ** | **~₪2,850/חודש** |

עלות למתאמן: ₪7.13/חודש (סטנדרט בענף).

**Flow טכני מלא (Cardcom + Greeninvoice native):**
```
1. מתאמן ממלא טופס → דף סליקה Cardcom (iframe מאובטח)
2. תשלום מוצלח → Cardcom יוצר טוקן כרטיס מאובטח (PCI DSS)
3. Cardcom שולח Webhook ל-Supabase Edge Function 'payment-received'
4. Edge Function מעדכנת trial_visits / members + שומרת את הטוקן ב-DB
5. Cardcom-Greeninvoice integration → חשבונית אוטומטית במייל למתאמן
6. notifyPush לדודי: "X שילם ₪Y, חשבונית #N ✅"

חיוב חודשי קבוע למנויים:
- Cardcom מחייב אוטומטית את הטוקן בתאריך החיוב.
- אם נכשל (כרטיס פג תוקף, אין כיסוי) → Webhook → Push לדודי + מייל למתאמן.
```

**מה צריך לבנות (3 קבצים בצד שרת):**
1. דף `/trial-payment` (אימון ניסיון) ו-`/subscribe` (מנוי חודשי) — טפסים עם iframe של Cardcom.
2. Edge Function `payment-received` — webhook handler (יצירת/עדכון רשומה ב-members או trial_visits).
3. דף ניהול תוכניות מנוי ב-TrainerDashboard (Admin) — להגדרת ₪300/₪400/₪450 וכו'.

**צעדים שדודי צריך לבצע לפני הקוד:**
1. ✅ חשבון בנק עסקי (יש — עוסק מורשה).
2. ⏳ לפנות ל-Cardcom (cardcom.solutions) → הצעת מחיר → הקמה ~2 שבועות.
3. ⏳ לפתוח חשבון Greeninvoice (greeninvoice.co.il) → להפעיל API → לשמור טוקן.
4. ⏳ לבקש מ-Cardcom להפעיל את האינטגרציה עם Greeninvoice (5 דקות עבודה אצלם).

**שאלה פתוחה אחת — מחיר מנוי חודשי:** עוד לא הוחלט. כיום בחולון: לבדוק מה גובים. בקאנטרי: דודי יקבע (משוער: ₪300-450 לחודש לפי מסלול).

### בדיקות שצריך לבצע ידנית עכשיו (לפני שלב ב׳)
1. לדחוף את השינוי ל-`main` (commit + push).
2. לחכות ל-Vercel build.
3. כניסה לדוחות → לראות שהכותרת "מתאמנים שלא הגיעו מעל שבועיים".
4. ללחוץ על כפתור 📲 ליד מתאמן אחד — לוודא שמופיע toast "התראה נשלחה ל-X" ולוודא שהמכשיר של המתאמן (אם הפעיל Push) קיבל באמת.
5. ללחוץ על "שלח Push ל-N" → לראות confirm dialog → לאשר → לראות toast עם count.
6. לוודא שלא נשלחות התראות לאנשים שלא הפעילו Push (זה אמור להיכשל בשקט בצד ה-Edge Function ולא לזרוק שגיאה בקליינט — ה-`notifyPush` עוטף ב-try/catch).

### ✅ בוצע ע"י המשתמש (01.05.2026)
- **ההודעה הכללית נשלחה** דרך AnnouncementsManager לכל המתאמנים הפעילים.
- ממתין: לחזור בעוד 2-3 ימים → לבדוק אם רשימת "לא נרשם מעולם" התקצרה.
- **לא להפעיל את שלב ב׳ (cron)** עד שנראה איך ההודעה הכללית עבדה והמשתמש מחליט.

---

# 📅 Session 30.04.2026 — Reports overhaul + BottomNav iOS fix

## תיקונים שבוצעו בסשן הזה

### 1. סרגל ניווט תחתון (BottomNav) — תיקון iOS PWA "עף למעלה"
**קבצים:** `src/index.css`, `src/components/BottomNav.jsx`

- `index.css`: `100dvh` במקום `100vh`, `overscroll-behavior-y: none` על html/body, fallback ל-`min-h-screen` של Tailwind.
- `BottomNav.jsx`: `inset: auto 0 0 0` במקום `bottom: 0`, `transform: translateZ(0)` (האצת חומרה), `WebkitBackfaceVisibility: hidden`.

### 2. דוחות (`ReportsManager.jsx`) — שכתוב מקיף

**שינוי קריטי במקור הנתונים:** מ-`checkins` ל-`class_registrations`. הסיבה: `checkins` יש בה constraint `unique(class_id, athlete_id)` (ב-`supabase-schema.sql` שורה 40), אז יש רק שורה אחת לכל זוג ולכן השדה `checked_in_at` משקף רק את ההצטרפות הראשונה. במודל הנוכחי "רישום = הגעה" — לכן `class_registrations` הוא מקור האמת.

**1000-row limit defensive fix:** הוספתי `.range(0, 99999)` לכל השאילתות + סינון 180 יום בצד השרת על `checkins`, `trial_visits` ו-`class_registrations`.

**זיהוי תחום (`detectDiscipline`):** נורמליזציה מסירה גרשים/רווחים/מקפים, אז כל הצורות (`ג׳יוג׳יטסו`, `גיו גיטסו`, `bjj`, `נו גי`, `גרפלינג`...) מזוהות כ-BJJ. סדר הבדיקות: 3-6 → MMA → Muay Thai → BJJ → ברירת מחדל BJJ.

**ילדים:** רק `3-6` בשם → ילדים. שיעורים אחרים עם "ילדים"/"נוער" → BJJ (זה בכוונה — האקדמיה בעיקרה BJJ).

**סקציות בדוח (סדר נוכחי):**
1. סיכום מהיר (StatCards)
2. סלייד טווח זמן (7/30/60/90/180 ימים)
3. **מתאמנים פעילים לפי תחום לחימה** — פילוח פנימי לפי מאמן + מד יחסי לכל מאמן + הסבר אוטומטי על חפיפה ("X מתאמנים רשומים אצל יותר ממאמן אחד").
4. **שיעורי ניסיון לפי תחום ולפי מאמן** — בעתיד יחובר לעמודת תשלום.
5. **מתאמנים שלא הגיעו מעל שבוע** — רשימה עם כפתור 💬 ווצאפ (wa.me link).
6. נרשמים חדשים.
7. נטישה לפי מאמן ולפי קבוצה.

**הוסרו:**
- "מתאמנים פעילים לפי מאמן" (כפילות — הפילוח כבר בתוך התחום).
- שתי סקציות "פעילות בפועל" (היו שגויות בגלל ה-unique constraint על checkins).

### 3. WhatsApp Reminder
**פונקציות עזר חדשות בראש `ReportsManager.jsx`:**
- `toIntlPhone(raw)` — ממיר מספר ישראלי לפורמט בינלאומי (0545551234 → 972545551234).
- `whatsappLink(phone, message)` — בונה wa.me URL.
- `inactiveReminderMessage(name, daysSince)` — תבנית שמתאימה את הטון: ≤14 ימים = "נשמח לשמוע ממך", >14 = "קרה משהו?", ללא רישום = "עוד לא התחלת להתאמן איתנו".

---

## ⚠️ My last pending task — התראות אוטומטיות למתאמנים לא פעילים

**הפרומפט המקורי (תרגום של מה שהמשתמש ביקש):**
> "אני רוצה שברגע שמתאמן שבוע שלם לא נרשם לאף אימון שהמערכת תשלח לו הודעה אישית אוטומטית באפליקציה, אפשרי ללא תשלום? וגם איך בווצאפ או באפליקציה."

**הסכם בין המשתמש לבין Claude:**
1. **סף הזמן:** שבוע או שבועיים — להחליט יחד מה הסף הנכון "כדי לא להטריד אותם". כרגע בקוד `7 ימים` (קבוע ב-`inactiveMembers` aggregation: `cutoff = Date.now() - 7 * DAY_MS`).
2. **ערוצים:** ווצאפ + אפליקציה (Push Notification).
3. **Push חינם לחלוטין** — Supabase Edge Function (500K הפעלות חינם) + Web Push API. תשתית קיימת ב-`src/lib/push.js` ו-`src/lib/notifyPush.js`.
4. **WhatsApp ידני** קיים (כפתור wa.me ב-ReportsManager). **WhatsApp אוטומטי** דורש Twilio (~0.05$/הודעה) — דחוי לעתיד.

**מה צריך לבנות:**

### שלב א׳ — Push Notification ידני
- כפתור 📲 **"שלח Push"** ליד כל מתאמן ברשימת הלא-פעילים (ב-ReportsManager).
- כפתור **"שלח לכל הלא-פעילים"** למעלה של הסקציה.
- שימוש ב-`notifyPush` הקיים (לבדוק חתימה ב-`src/lib/notifyPush.js`).

### שלב ב׳ — Push אוטומטי יומי
- **Supabase Edge Function** חדשה: `notify-inactive-members`.
  - שאילתה: `members` שאין להם `class_registrations.week_start` בטווח X ימים.
  - שליחת Web Push לכל אחד.
  - לוג של מי קיבל.
- **טריגר cron — אופציות חינמיות:**
  - GitHub Actions עם cron schedule (מומלץ).
  - cron-job.org.
  - Supabase Pro pg_cron — לא חינם.
- **שעה לאישור עם המשתמש:** הצעה 09:00.

### שלב ג׳ — תבנית הודעה
יש כבר ב-`ReportsManager.jsx` פונקציה `inactiveReminderMessage(name, daysSince)` שמתאימה טון. לאמץ אותה גם ל-Push.

### שלב ד׳ — דו-כיווניות (פתוח להחלטה)
המשתמש שאל אם המתאמן יכול לענות. תשובה:
- **WhatsApp** = דו-כיווני באופן טבעי.
- **Push** = חד-כיווני בלבד. לתשובה תוך-אפליקציה צריך לבנות **צ'אט פנימי** (טבלת `messages` + UI). 1-2 ימי עבודה. דחוי.

**ההצעה הנוכחית:**
1. שלב 1 (מהר וחינם): Push חד-כיווני שמודיע לא-פעילים. בלחיצה על ההתראה האפליקציה תיפתח על מסך הלו"ז עם כפתור שפותח ווצאפ למאמן. **דו-כיווניות תחת ווצאפ, התראה תחת Push.**
2. שלב 2 (כשירצה): צ'אט פנימי באפליקציה.

**להחלטה מחר:**
- סף ימים: 7 או 14?
- שעה לשליחת ה-Push היומי: 09:00? אחר?
- האם להתחיל בשלב א׳ (Push ידני) או לקפוץ ישר לשלב ב׳ (Push אוטומטי)?

---

## בעיות ידועות במודל הנתונים (להתייחסות עתידית)

1. **`unique(class_id, athlete_id)` על `checkins`** — `supabase-schema.sql` שורה 40. מונע מעקב נוכחות שבועי אמיתי. אם בעתיד נרצה דוח "כמה פעמים בא דני באמת" — צריך migration: drop של ה-unique הקיים + הוספת `unique(class_id, athlete_id, date(checked_in_at))`. דורש עדכון 4-5 קבצים בקוד שמשתמשים ב-upsert עם `onConflict: 'class_id,athlete_id'`.

2. **`members.coach_id` ו-`members.group_ids`** ריקים אצל ~71 מתוך 73 מתאמנים. לכן עברנו ל-class_registrations. אם תהיה דרישה לדוח לפי שיוך פורמלי, צריך קודם migration שתמלא את השדות (אולי על בסיס ה-class_registrations עצמן).

3. **לוג אבחון בקונסול** — בכל טעינת דוח:
   ```
   [Reports] loaded: { members, classes, coaches, checkins_present_180d, trial_visits_180d, class_registrations_180d }
   [Reports] class classification: { BJJ, Muay Thai, MMA, ילדים, אחר }
   [Reports] שיעורים שמסווגים כ"אחר": [...]
   ```

---

# 📅 Session 24.04.2026 (קודם) — מבנה הפרויקט (נשאר בתוקף)

## מבנה הפרויקט
- **teampact-app** (React 19 + Vite + Tailwind + Supabase) - מתארח ב-Vercel (auto-deploy מ-`main`)
- **teampact-bot** (Node.js + Express) - backend/bot נפרד

**GitHub:** https://github.com/teampactbjj-glitch/teampact-app
**Vercel Project:** teampact-app (prj_ylZzNVEWsYelzB947OJHvG4ZAAtI)

## מה עשינו היום - סיכום התיקונים

### ✅ תיקון 1: התראות הזמנת מוצרים
**קבצים:** `src/components/athlete/AthleteDashboard.jsx`

**לפני:** ההתראה שהמנהל קיבל כללה רק שם מתאמן + שם מוצר.

**אחרי:** כוללת מידה, צבע, אפשרות רכישה, מחיר ופרטי רכיבים.

**Commit:** `1960e8e` - "תיקון התראות הזמנה + תצוגת פרטי הזמנה למנהל"

### ✅ תיקון 2: תצוגת פרטי הזמנה ב-ShopManager
**קובץ:** `src/components/trainer/ShopManager.jsx`

**הבאג האמיתי שגילינו:** ב-`fetchAll()` כשמיזגנו `product_orders` (ישן) עם `product_requests` (חדש), **זרקנו את כל שדות הווריאציה** (selected_size, selected_color, notes, unit_price, total_price, quantity). הנתונים היו ב-DB אבל לא הגיעו למסך.

**התיקון:** משנה את המיזוג מ-`{ id, product_name, status, ... }` ל-`{ ...o, members: {...}, _source: 'request' }` (spread של כל השדות).
בנוסף הוספתי תצוגה של badges (📏 מידה, 🎨 צבע) + הערות + מחיר במסך ההזמנות של המנהל.

**Commit:** `1b94520` - "תיקון תצוגת פרטי הזמנה (מידה/צבע/מחיר) במסך הזמנות של המנהל"

### ✅ תיקון 3: גם `ProductRequests.jsx` עודכן להצגה מלאה
הוספת badges של מידה/צבע/כמות + notes + מחיר למסך בקשות המוצרים.

### ✅ תיקון 4 (הושלם - commit f548965)
**הקבצים:** `src/components/athlete/ProductDetail.jsx` + `src/components/athlete/AthleteDashboard.jsx`

**הפיצ'ר החדש:** `variant_components` לכל `purchase_option`.
כל אפשרות רכישה יכולה להגדיר רשימת רכיבים, כל אחד עם מידות וצבעים משלו.

**דוגמה לפורמט:**
```json
{
  "name": "תיק + סט נו גי",
  "price": 600,
  "components": [
    { "name": "מכנס", "sizes": ["S","M","L"], "colors": ["שחור","לבן"] },
    { "name": "רשגארד", "sizes": ["S","M","L"], "colors": ["שחור","לבן"] }
  ]
}
```

**מה שהוספנו לקוד:**
- `ProductDetail.jsx`: state חדש `componentSelections`, פונקציית `updateComponentSelection`, render של picker פר-רכיב עם UI של כרטיסיה בצבעי gradient כחול-אמרלד.
- `AthleteDashboard.jsx` `handleOrder`: פרמטר חמישי `componentSelections`. מעדכן `notes` עם פירוט פר-רכיב (למשל "מכנס מידה M צבע שחור · רשגארד מידה L צבע לבן").
- גוף ה-push notification כולל את כל הרכיבים.

### ✅ תיקון 5 (הושלם - commit 45a0ad5): UI לניהול רכיבים
`src/components/trainer/ShopManager.jsx` - הוספתי UI בטופס הוספה/עריכת מוצר:
- בכל אפשרות רכישה (purchase_option) יש כפתור "+ הוסף רכיב"
- לכל רכיב: שם + רשימת מידות (מופרדות בפסיק) + רשימת צבעים (מופרדים בפסיק)
- ב-submit הקוד שומר את `components` בתוך כל option ב-DB
- אם ה-option עם components נטען לעריכה - הנתונים נשמרים אוטומטית

---

# 📅 Session 29.04.2026 – פרויקט הנגשת האפליקציה

## הקשר ומטרה
המשתמש ביקש להנגיש את האפליקציה כדי לעמוד בחוק שוויון זכויות לאנשים עם מוגבלות (התשנ"ח-1998) ובתקנות הנגישות לשירות. התקן הנדרש: **WCAG 2.1 AA / ת"י 5568**.

## מסמכים שנוצרו (בתיקיית השורש)
1. **ACCESSIBILITY_AUDIT.md** – אודיט מקיף + Roadmap.
2. **ACCESSIBILITY_STATEMENT.md** – תבנית הצהרת נגישות חוקית עם placeholders.

## ספריית קומפוננטות נגישות חדשה
תיקייה: `src/components/a11y/`
- `Modal.jsx` – role=dialog, aria-modal, focus trap, ESC, focus restore.
- `Toast.jsx` – role=alert + aria-live, סגירה אוטומטית.
- `Field.jsx` – wrapper לטפסים, מקשר label↔input אוטומטית עם htmlFor/id.
- `SkipLink.jsx` – דילוג ניווט (sr-only עד Tab).
- `ConfirmContext.js` + `ConfirmProvider.jsx` + `useConfirm.js` – החלפה ל-window.confirm().
- `ToastContext.js` + `ToastProvider.jsx` + `useToast.js` – החלפה ל-window.alert().
- `index.js` – barrel export.

## API לשימוש בקבצים הבאים
```jsx
import { Field, useToast, useConfirm } from '../a11y'  // או './a11y' לפי עומק

const toast = useToast()
toast.success('נשמר!')        // במקום alert('נשמר!')
toast.error('שגיאה')          // במקום alert('שגיאה')

const confirm = useConfirm()
const ok = await confirm({ title: 'למחוק?', message: 'לא הפיך', danger: true })
if (!ok) return                // במקום if (!window.confirm(...)) return

<Field label="שם מלא" required>
  {(props) => <input {...props} type="text" value={x} onChange={...} className="..." />}
</Field>
```

⚠️ **חשוב:** `useConfirm` מחזיר Promise – הפונקציה הקוראת חייבת להיות `async` ו-`await` חובה.

## קבצים שכבר טופלו ✅ (build נקי, lint נקי)
1. `src/main.jsx` – עטוף ב-ToastProvider + ConfirmProvider.
2. `src/App.jsx` – SkipLink בכל branches, UpdateBanner נגיש.
3. `src/components/auth/AthleteLogin.jsx` – פיילוט מלא.
4. `src/components/auth/TrainerLogin.jsx`.
5. `src/components/RegisterPage.jsx` – fieldset/legend לסניפים, aria-pressed.
6. `src/components/auth/RegisterCoachPage.jsx`.
7. `src/components/BottomNav.jsx` – aria-label, aria-current=page, aria-hidden לאייקונים.
8. `src/components/trainer/TodayClasses.jsx` – 22 alert/confirm הוחלפו (8 confirm dialogs + 14 toasts). build נקי. (29.04.2026)
9. `src/components/athlete/AthleteDashboard.jsx` – 17 alert/confirm הוחלפו ב-4 קומפוננטות (AnnouncementsTab, ShopTab, ProfileTab, AthleteDashboard). 3 confirm dialogs + 14 toasts. build נקי. (29.04.2026) ✅ אושר ע"י המשתמש.
10. `src/components/trainer/AthleteManagement.jsx` – 16 alert/confirm הוחלפו ב-2 קומפוננטות (AthleteManagement + PendingLeadCard). 9 confirm dialogs + 7 toasts. build נקי. (29.04.2026)
11. `src/components/athlete/ClassSchedule.jsx` – 4 alert→toast.error. (29.04.2026)
12. `src/components/athlete/ProductDetail.jsx` – הוסף aria-pressed לכל כפתורי בחירה (מידה/צבע/אפשרות רכישה/רכיבים) + role="group" + aria-labelledby. (29.04.2026)
13. `src/components/EnablePushBanner.jsx` – role=region + aria-label לכפתורים + aria-hidden לאייקונים. (29.04.2026)
14. `src/components/PendingApprovalScreen.jsx` – `<main id="main-content">` + role=status/aria-live + h1 במקום h2 + aria-hidden לאייקונים. (29.04.2026)
15. `src/components/ErrorBoundary.jsx` – `<main>` + role=alert/aria-live=assertive + h1. (29.04.2026)
16. `src/components/trainer/ShopManager.jsx` – 7 alert→toast + 2 כפתורי מחיקה ללא confirm קיבלו `await confirm()` + aria-label דינמיים + תיקון `alt="preview"`. (29.04.2026)
17. `src/components/trainer/CoachesManager.jsx` – 4 confirm→`await confirm()`. (29.04.2026)
18. `src/components/trainer/LeadsManager.jsx` – 1 confirm + 1 alert→toast. (29.04.2026)
19. `src/components/trainer/AnnouncementsManager.jsx` – 1 alert→toast + radio group עם fieldset/legend + תיקון alt. (29.04.2026)
20. `src/components/trainer/ImportAthletes.jsx` – 1 alert→toast + Modal הפך לנגיש (role=dialog, aria-modal, ESC, focus trap). (29.04.2026)
21. `src/components/trainer/ReportsManager.jsx` – BarRow קיבל role=progressbar + aria-valuenow/min/max + aria-label דינמי. (29.04.2026)
22. `src/components/trainer/ProfileChangeRequests.jsx` – heading hierarchy תוקן (h2→h3). (29.04.2026)

המשתמש אישר במהלך הסשן: "נראה שהכל עובד" אחרי הפיילוט של AthleteLogin.

## ⚠️ My last pending task – נגישות

**הפרומפט המקורי:** "אני רוצה לעשות את האפליקציה שלנו לנגישה כדי לעמוד בחוק... תתחיל לעבוד על זה קח את ההרשאות שצריך כדי לזה יהיה חוקי"

**איפה אנחנו:**
- שלב A (קומפוננטות בסיס) – ✅
- שלב B (פיילוט) – ✅
- שלב C (הרחבה לכל הקבצים) – ✅ **הושלם 29.04.2026. 22 קבצים טופלו.**

**רשימת כל הקבצים שטופלו במהלך הסשן 29.04.2026:**

🔴 **alert/confirm – כולם הוחלפו:**
1. ✅ TodayClasses.jsx — 22 הוחלפו
2. ✅ AthleteDashboard.jsx — 17 הוחלפו (4 קומפוננטות) — **אושר ידנית ע"י המשתמש**
3. ✅ AthleteManagement.jsx — 16 הוחלפו (כולל PendingLeadCard)
4. ✅ ShopManager.jsx — 7 alerts + הוספת 2 confirm dialogs לכפתורי מחיקה
5. ✅ CoachesManager.jsx — 4 confirm
6. ✅ ClassSchedule.jsx — 4 alert
7. ✅ LeadsManager.jsx — 1 confirm + 1 alert
8. ✅ AnnouncementsManager.jsx — 1 alert + fieldset/legend
9. ✅ ImportAthletes.jsx — 1 alert + Modal נגיש מלא

🟠 **תיקוני נגישות נוספים – כולם הושלמו:**
10. ✅ ProductDetail.jsx — aria-pressed + role=group
11. ✅ EnablePushBanner.jsx — role=region + aria-label
12. ✅ PendingApprovalScreen.jsx — main + role=status + h1
13. ✅ ErrorBoundary.jsx — main + role=alert + h1
14. ✅ ReportsManager.jsx — BarRow כ-progressbar
15. ✅ ProfileChangeRequests.jsx — heading hierarchy

**קבצים שלא נדרש בהם תיקון (אין alert/confirm/בעיות):**
- TrainerDashboard.jsx (h1 קיים, ניווט תקין)
- TrainerProfile.jsx
- ProductRequests.jsx

**שלב D – הצהרת נגישות + לינקים – ✅ הושלם (29.04.2026):**

23. ✅ `src/components/AccessibilityPage.jsx` – דף הצהרת נגישות חדש, נגיש בעצמו, עם פרטי קשר רכז (דודי), מספר נציבות, תאריכים, ולינק לאתר הנציבות.
24. ✅ `src/App.jsx` – הוספת route `/accessibility` (זמין ללא login).
25. ✅ AthleteDashboard.jsx (ProfileTab) – לינק "♿ הצהרת נגישות" מתחת לאתר המועדון.
26. ✅ TrainerProfile.jsx – אותו לינק.
27. ✅ AthleteLogin.jsx – לינק לדף נגישות במסך ההתחברות.
28. ✅ TrainerLogin.jsx – לינק לדף נגישות במסך ההתחברות של מאמנים.

**שלב E – Accessibility Widget צף – ✅ הושלם (29.04.2026):**

29. ✅ `src/components/AccessibilityWidget.jsx` – ווידג'ט פעיל:
    - כפתור צף ♿ בפינה הימנית-תחתונה (z-index 9999)
    - 5 הגדרות: גודל פונט (3 רמות), ניגודיות, השהיית אנימציות, הדגשת קישורים+פוקוס, סמן גדול
    - שמירה ב-localStorage תחת `tp-a11y-prefs`
    - החלה מיידית בטעינה (לפני React mount, מונע הבזקה)
    - dialog נגיש: role=dialog, aria-modal, ESC, focus trap, focus restore
30. ✅ `src/index.css` – CSS גלובלי עם classes: `a11y-text-large`, `a11y-text-xl`, `a11y-high-contrast`, `a11y-no-animations`, `a11y-emphasized-links`, `a11y-big-cursor`
31. ✅ `src/App.jsx` – AccessibilityWidget מופיע בכל המסכים (login, register, dashboard, pending, error)

**משימות שנותרו (לא חיוניות מבחינה חוקית):**
1. **בדיקה ידנית של דף /accessibility** – נווט לכתובת `/accessibility` ובדוק שהדף מוצג כראוי בצד מובייל ודסקטופ.
2. **בדיקה ידנית של כל ממשק המתאמן** (התחברות → יומן → חנות → פרופיל → הזמנת מוצר עם רכיבים).
3. **הרצת Lighthouse Audit** (אופציונלי, להוכחת ציון 95+).
4. אופציונלי: התקנת `eslint-plugin-jsx-a11y` למניעת רגרסיה עתידית.

**הערת המשתמש:** אין כוונה לשכור יועץ נגישות. זו מערכת פנימית למתאמנים שעוסקים באומנויות לחימה. הפעולות שננקטו: ההצהרה פורסמה תחת `/accessibility`, ההתאמות לפי WCAG 2.1 AA יושמו בקוד, רכז הנגישות (דודי בן זקן) זמין במייל teampactbjj@gmail.com.

**מה נשאר אופציונלי (לא נדרש חוקית):**
- ממשק מנהל (admin-only) – לא חייב לפי החוק (זה כלי פנימי שלך).
- ה-eslint warnings הקיימים (`navigate` לא בשימוש, `loadPending` accessed before declared, empty blocks) – לא קשורים לנגישות.

---

# 📚 משימות קודמות (Session 24.04.2026 – לא קשור לנגישות)

## ⚠️ My previous pending task (אולי הושלם, צריך לוודא)

### המשימה שנותרה למשתמש - הגדרת רכיבים למוצר "TeamPact תיק"
אחרי ש-Vercel יסיים לבנות (דקה-שתיים מ-commit 45a0ad5):
1. כנס לממשק הניהול → חנות → ערוך "TeamPact תיק מועדון מקצועי"
2. בכל אחת מ-2 אפשרויות הרכישה (תיק + חליפה, תיק + סט נו גי):
   - לחץ "+ הוסף רכיב"
   - הקלד שם הרכיב (חליפת גיו גיטסו / מכנס / רשגארד)
   - הקלד מידות מופרדות בפסיק
   - הקלד צבעים מופרדים בפסיק
3. "תיק + סט נו גי" צריך 2 רכיבים (מכנס + רשגארד)
4. שמור את המוצר
5. בדוק כמתאמן שהבחירה עובדת

### אופציה חלופית: SQL ישיר
הרץ ב-Supabase SQL Editor:
```sql
UPDATE announcements
SET purchase_options = '[
  {
    "name": "תיק + חליפת גיו גיטסו",
    "note": "חיסכון של 80 ש״ח",
    "price": 800,
    "is_featured": true,
    "components": [
      {
        "name": "חליפת גיו גיטסו",
        "sizes": ["A0","A1","A2","A3","A4"],
        "colors": ["שחור","לבן","כחול"]
      }
    ]
  },
  {
    "name": "תיק + סט נו גי",
    "note": "חיסכון של 80 ש״ח",
    "price": 600,
    "is_featured": true,
    "components": [
      {
        "name": "מכנס",
        "sizes": ["XXXS","XXS","XS","S","M","L","XL","XXL","XXXL"],
        "colors": ["שחור","לבן"]
      },
      {
        "name": "רשגארד",
        "sizes": ["XXXS","XXS","XS","S","M","L","XL","XXL","XXXL"],
        "colors": ["שחור","לבן"]
      }
    ]
  }
]'::jsonb
WHERE id = '4d7d3cab-e89b-4cd9-a3f7-a79a3c6a165e';
```

(⚠️ לעדכן את המידות/צבעים של החליפה לפי מה שבפועל קיים במועדון)

### שלב C - בדיקה
1. המתן ש-Vercel יבנה (1-2 דק')
2. פתח את האפליקציה → חנות → תיק מועדון מקצועי
3. בחר "תיק + סט נו גי" - אמור להופיע 2 כרטיסי רכיבים (מכנס + רשגארד) עם מידה+צבע לכל אחד
4. בחר "תיק + חליפה" - כרטיס אחד עם מידה+צבע
5. בצע הזמנת בדיקה, וודא שההתראה והמסך ניהול מציגים את הפרטים המלאים

## עובדות מערכת שצריך לזכור

### Auth (Supabase)
- **PROJECT_URL:** https://pnicoluujpidguvniwub.supabase.co
- **Login:** email+password (signInWithPassword) - אין OTP
- **Persistence:** localStorage עם key `teampact-session` (persistSession: true)
- **נושא "מבקש קוד בכל פתיחה":** היה בגלל שינויים אחרונים + קאש SW - נפתר ברענון חזק

### מבנה נתונים רלוונטי
- `announcements` - מוצרים, הודעות, סמינרים (שדה `type`: 'product'/'seminar'/'general')
  - `purchase_options` (jsonb) - אפשרויות רכישה `[{name, price, note, is_featured, components?}]`
  - `available_sizes`, `available_colors` - לוריאציה ברמת המוצר (כשאין components באפשרות)
  - `bundle_items` (jsonb) - לא בשימוש כרגע
  - `variant_components` - עמודה שקיימת במיגרציה אבל לא הוספנו בה UI לניהול עדיין
- `product_requests` - הזמנות (החדש עם פרטים)
  - `selected_size`, `selected_color`, `notes`, `unit_price`, `total_price`, `quantity`
- `product_orders` - הזמנות (הישן)

### מסכים רלוונטיים
- `ProductDetail.jsx` - דף פירוט מוצר למתאמן (כאן ה-UI של בחירת וריאציה)
- `AthleteDashboard.jsx` - טאב חנות + שמירת ההזמנה + שליחת התראה
- `ShopManager.jsx` - ניהול מוצרים + מסך הזמנות למנהל
- `ProductRequests.jsx` - מסך נוסף לבקשות מוצרים

### Service Worker + PWA
- `public/sw.js` - מנהל push notifications
- App.jsx בודק עדכוני SW כל 60 שניות
- כדי לעדכן מתאמנים: סגירה ופתיחה של האפליקציה (לא מזעור)

## TODO עתידי (לא דחוף)
- להוסיף UI בניהול המוצרים (ShopManager) שיאפשר להגדיר `components` לכל purchase_option ללא SQL
- לחשוב אם להשתמש ב-`product_variants` table (קיים במיגרציה) במקום ב-JSONB
- לשקול הוספת `quantity` כפרמטר בבחירה (כרגע ברירת מחדל 1)
