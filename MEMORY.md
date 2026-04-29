# MEMORY - TeamPact App - 24.4.2026

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

המשתמש אישר במהלך הסשן: "נראה שהכל עובד" אחרי הפיילוט של AthleteLogin.

## ⚠️ My last pending task – נגישות

**הפרומפט המקורי:** "אני רוצה לעשות את האפליקציה שלנו לנגישה כדי לעמוד בחוק... תתחיל לעבוד על זה קח את ההרשאות שצריך כדי לזה יהיה חוקי"

**איפה אנחנו:**
- שלב A (קומפוננטות בסיס) – ✅
- שלב B (פיילוט) – ✅
- שלב C (הרחבה לכל הקבצים) – 🟡 **באמצע. 7 קבצים טופלו, ~13 נשארו.**

**המשך עבודה בסדר עדיפות (לסשן הבא):**

🔴 **קבצים עם alert/confirm רבים – הכי דחוף:**
1. `src/components/trainer/TodayClasses.jsx` – 24 alert/confirm.
2. `src/components/athlete/AthleteDashboard.jsx` – 17 alert/confirm.
3. `src/components/trainer/AthleteManagement.jsx` – 16 alert/confirm.
4. `src/components/trainer/ShopManager.jsx` – 7 alert/confirm + טופס ענק עם fieldset חסר + `alt="preview"` (שורה 547).
5. `src/components/trainer/CoachesManager.jsx` – 4 alert/confirm.
6. `src/components/athlete/ClassSchedule.jsx` – 4 alert/confirm.
7. `src/components/trainer/LeadsManager.jsx` – 2 alert/confirm.
8. `src/components/trainer/AnnouncementsManager.jsx` – 1 alert + radio group ללא fieldset + `alt="preview"` (שורה 270).
9. `src/components/trainer/ImportAthletes.jsx` – 1 alert + Modal ללא role=dialog (שורות 172-307).

🟠 **קבצים נוספים שדורשים תיקון נגישות:**
10. `src/components/trainer/TrainerDashboard.jsx`
11. `src/components/trainer/TrainerProfile.jsx`
12. `src/components/trainer/ReportsManager.jsx` – BarRow עם רוחב צבעוני בלי aria-label/title.
13. `src/components/trainer/ProductRequests.jsx`
14. `src/components/trainer/ProfileChangeRequests.jsx` – heading hierarchy (h2 בלי h1).
15. `src/components/athlete/ProductDetail.jsx`
16. `src/components/EnablePushBanner.jsx`
17. `src/components/PendingApprovalScreen.jsx`
18. `src/components/ErrorBoundary.jsx`

**משימות אחרי שלב C:**
- יצירת דף `/accessibility` באפליקציה שמציג את `ACCESSIBILITY_STATEMENT.md` (לאחר מילוי הפרטים האישיים).
- הוספת קישור "נגישות" בתחתית כל מסך / בפרופיל.
- הרצת Lighthouse + תיקון לציון 95+.
- שכירת יועץ נגישות מוסמך מטעם משרד המשפטים (3,000-8,000 ₪ + מע"מ 18%).
- אופציונלי: התקנת `eslint-plugin-jsx-a11y` למניעת רגרסיה.

**הוראות להמשך:**
1. קרא את ACCESSIBILITY_AUDIT.md לפירוט הבעיות.
2. בנה לפני התחלה: `cd /Users/dudibenzaken/teampact-app && npx vite build --outDir /tmp/test`
3. התחל מקובץ #1 (TodayClasses.jsx). דפוס: import של useToast/useConfirm/Field, החלפת alert→toast, confirm→`await confirm`, label→Field.
4. אחרי כל קובץ או שניים – `npx eslint <file>` ו-build.
5. לפני קובץ קריטי כמו AthleteDashboard – בקש מהמשתמש לבדוק ידנית.

לא לפגוע בלוגיקה הקיימת. עדיף קובץ אחד נכון מ-5 קבצים שבורים.

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
