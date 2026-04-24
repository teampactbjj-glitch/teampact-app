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

## ⚠️ My last pending task

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
