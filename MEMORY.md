# MEMORY - TeamPact App

> **🆕 הסשן האחרון: 30.04.2026 — דוחות + תיקון BottomNav iOS PWA**
>
> ⚠️ **My last pending task** מוגדר למטה בסעיף "Session 30.04.2026". קרא אותו ראשון.

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
