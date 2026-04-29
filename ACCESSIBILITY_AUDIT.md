# דוח אודיט נגישות – TeamPact App

**תאריך:** 29 באפריל 2026
**תקן יעד:** WCAG 2.1 רמה AA (ת"י 5568) – הרמה הנדרשת לפי חוק שוויון זכויות לאנשים עם מוגבלות (התשנ"ח-1998) ותקנות הנגישות לשירות (התשע"ג-2013)
**היקף:** אפליקציית React (Vite + Tailwind + Supabase), כולל זרימות מתאמן, מאמן, רישום ולוגין

---

## תקציר מנהלים

האפליקציה **לא** עומדת כרגע בדרישות החוק. נמצאו 4 כשלים חוצים שגורמים לזה שכל מסך באפליקציה לא יעבור ביקורת. הם פשוטים יחסית לתיקון – זה לא דורש שכתוב, אלא החלפת דפוסים.

**המספרים המאומתים בקוד (Grep ישיר):**

- `alert()` / `confirm()` – **77 מופעים ב-10 קבצים**. כל אחד מהם חוסם קוראי מסך וסביבת מקלדת.
- `htmlFor=` (קישור label ל-input) – **0 מופעים בכל הקוד**. אף שדה טופס באפליקציה לא מקושר נגישותית ל-label שלו.
- מאפייני ARIA (`aria-label`, `aria-live`, `role="dialog"`, וכו') – **3 שימושים בלבד בכל הפרויקט**.
- `lang` ו-`dir` ב-HTML root – לא מוגדר (`index.css` מגדיר `direction: rtl` רק לאלמנטים, לא ל-document).

זה אומר שאדם עיוור לא יכול להירשם, להתחבר, או להזמין שיעור באפליקציה בכלל. זה מסכן תביעה או קנס מהנציבות לשוויון זכויות.

---

## כשלים גלובליים (מופיעים בכל האפליקציה) – 🔴 חוסמי שיגור

### G1. שימוש מסיבי ב-`alert()` ו-`confirm()`

**מיקום:** 77 מופעים. ריכוז גבוה ב-`AthleteManagement.jsx` (16), `TodayClasses.jsx` (24), `AthleteDashboard.jsx` (17), `ShopManager.jsx` (7).

**מה נשבר:**
- WCAG 2.4.3 (Focus Order), 4.1.3 (Status Messages), 2.1.1 (Keyboard).
- `alert()` חוסם את ה-thread של הדפדפן וקופץ מחוץ לזרימת ה-DOM. רוב קוראי המסך מטפלים בו לא טוב.
- `confirm()` ממקם את ה-focus באופן לא ניתן לחיזוי, אין לעצב את הכפתורים, ולמשתמש יש שני כפתורים בלי ARIA.

**פתרון:** קומפוננטת `<Modal>` אחת ו-קומפוננטת `<Toast>` אחת. דוגמת מימוש בסעיף הפתרונות בהמשך.

---

### G2. כל ה-`<label>` באפליקציה לא מקושר ל-`<input>`

**מיקום:** כל הטפסים. `RegisterPage.jsx`, `AthleteLogin.jsx`, `RegisterCoachPage.jsx`, `TrainerLogin.jsx`, `ShopManager.jsx`, `AnnouncementsManager.jsx`, וכל form אחר.

**דוגמה (`RegisterPage.jsx:163-170`):**
```jsx
<label className="text-xs font-semibold text-gray-500 block mb-1">שם מלא *</label>
<input
  className="w-full border rounded-lg px-3 py-2 text-sm ..."
  placeholder="ישראל ישראלי"
  value={form.full_name}
  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
/>
```

**מה חסר:** `htmlFor` ב-label, `id` ב-input. קורא מסך משמיע "טקסט עריכה" בלי להגיד שזה "שם מלא".

**פתרון:** בכל מקום:
```jsx
<label htmlFor="full-name" className="...">שם מלא *</label>
<input
  id="full-name"
  required
  aria-required="true"
  ...
/>
```

**WCAG:** 1.3.1 (Info and Relationships), 4.1.2 (Name, Role, Value), 3.3.2 (Labels or Instructions).

---

### G3. הודעות שגיאה והצלחה בלי `role="alert"` / `aria-live`

**מיקום:** הצגות שגיאה דינמיות בכל טופס. דוגמה ב-`RegisterPage.jsx:251`:
```jsx
{error && <p className="text-red-500 text-sm text-center">{error}</p>}
```

ב-`AthleteLogin.jsx:57`:
```jsx
{error && <p className="text-red-500 text-sm text-center">{error}</p>}
```

**מה חסר:** קוראי מסך לא מודיעים שמשהו השתנה. המשתמש מקבל "אימייל או סיסמה שגויים" אבל לא שומע את זה.

**פתרון:**
```jsx
{error && <p role="alert" aria-live="polite" className="text-red-500 ...">{error}</p>}
```

**WCAG:** 4.1.3 (Status Messages).

---

### G4. שורש ה-HTML ללא `lang="he"` ו-`dir="rtl"`

**מיקום:** `index.css` מגדיר `* { direction: rtl }` אבל ה-`<html>` עצמו לא מקבל `lang` ו-`dir`. קורא מסך מבטא טקסט עברי בקול אנגלי.

**פתרון:** ב-`main.jsx` או ב-`index.html`:
```html
<html lang="he" dir="rtl">
```

**WCAG:** 3.1.1 (Language of Page).

---

### G5. ניגודיות צבעים נמוכה במקומות מרובים

**דוגמאות שזיהיתי בקוד:**
- `text-gray-400` על רקע לבן – יחס ניגודיות ~2.85:1, לא עומד ב-AA (דרוש 4.5:1).
  - `App.jsx:152`: `<p className="text-gray-400">טוען...</p>`
  - `RegisterPage.jsx:159`: `<p className="text-sm text-gray-400 mt-0.5">מלא את הפרטים...</p>`
- `text-gray-500` על רקע לבן – יחס ~4.6:1, על הסף.
- `text-blue-100` על `bg-gradient-to-br from-blue-600 to-blue-800` ב-`InstallBanner.jsx` – ניגודיות נמוכה לטקסט קטן (4xs).

**פתרון:** החלף ל-`text-gray-600` ומעלה לטקסט רגיל, `text-gray-700` לטקסטים חשובים. ל-large text (≥18px bold או ≥24px) `text-gray-500` עדיין בסדר.

**WCAG:** 1.4.3 (Contrast Minimum).

---

### G6. אין skip link ולא heading hierarchy יציבה

ה-DOM מתחיל ב-`<div id="root">` בלי skip-to-content. במקומות יש `<h2>` ישר בלי `<h1>` קודם (לדוגמה `ProfileChangeRequests.jsx`).

**פתרון:** הוסף ב-`App.jsx` בתחילת ה-render:
```jsx
<a href="#main-content" className="sr-only focus:not-sr-only ...">דלג לתוכן הראשי</a>
```
ועטוף את התוכן הראשי ב-`<main id="main-content">`.

**WCAG:** 2.4.1 (Bypass Blocks), 1.3.1, 2.4.6 (Headings and Labels).

---

## כשלים ממוקדים לפי קובץ

### `App.jsx` – 🔴

- **שורה 17-18:** ניתוב מבוסס `window.location.pathname` ישיר במקום `react-router`. עובד, אבל לא מודיע לקורא מסך על מעבר עמוד.
- **שורה 130-146:** UpdateBanner – אין `role="status"` או `aria-live`. משתמש עיוור לא ידע שיש עדכון.
- **שורה 152:** `text-gray-400` על רקע לבן – ניגודיות נמוכה.

### `BottomNav.jsx` – 🔴

- **שורה 19:** `<nav>` בלי `aria-label="ניווט ראשי"`.
- **שורה 24:** כל הכפתורים בלי `aria-current="page"` למצב פעיל. קורא מסך לא יודע באיזה טאב המשתמש נמצא.
- **שורה 30-31:** האייקון (אימוג'י) הוא הסימן הוויזואלי המרכזי, אבל אין `aria-hidden="true"` עליו, אז קורא מסך מקריא "לוח 📅" – לא נורא, אבל לא תקני.
- **שורות 32-51:** ה-badges של מספרים (`scheduleCount`, `ordersCount`, וכו') בלי label מסביר. קורא מסך אומר רק את המספר. צריך:
  ```jsx
  <span aria-label={`${scheduleCount} בקשות חדשות`}>{scheduleCount}</span>
  ```

### `RegisterPage.jsx` – 🔴

- **שורות 163-248:** כל 7 הטפסים – אין `htmlFor`/`id` (ראה G2).
- **שורה 251:** הודעת שגיאה בלי `role="alert"` (ראה G3).
- **שורות 220-233:** "כפתורי סניף" – לחיצה משנה מצב (`✓` מתווסף), אבל אין `aria-pressed`. קורא מסך לא מבין שזה toggle.
  ```jsx
  <button
    aria-pressed={form.branch_ids.includes(b.id)}
    type="button"
    ...
  >
  ```
- **שורה 67-69:** הודעת ולידציה ב-state, אבל ה-input לא מקבל `aria-invalid="true"` כשיש שגיאה.

### `AthleteLogin.jsx` – 🔴

- **שורה 28:** `alert('קישור לאיפוס סיסמה נשלח למייל שלך')` – שגיאה G1. החלף ל-toast.
- **שורות 46-55:** labels בלי `htmlFor` (ראה G2).
- **שורה 57:** error בלי `role="alert"` (ראה G3).

### `InstallBanner.jsx` – 🟠

- **שורה 77:** SVG עם `aria-hidden` – טוב.
- **שורה 71-94:** טקסט הסבר על `bg-gradient-to-br from-blue-600 to-blue-800` עם `text-blue-100` – לבדוק ניגודיות.
- **שורה 56-58:** כפתור "התקן" כ-`<button>` עם className של underline בלבד – נראה כמו לינק. אסתטית בסדר, אבל סמנטית מבלבל.

### `EnablePushBanner.jsx` – 🟠 (לא נבדק לעומק, צריך לסרוק)

### `ErrorBoundary.jsx` – 🟠 (לא נבדק)

### `PendingApprovalScreen.jsx` – 🟠 (לא נבדק)

### `RegisterCoachPage.jsx` – 🔴

- אותם כשלים כמו `RegisterPage.jsx` (לא נבדק שורה-שורה אבל זה דפוס חוצה).

### `AthleteDashboard.jsx` – 🔴

- **17 מופעי alert/confirm.** דוגמאות:
  - שורה 399: `if (!confirm(\`לבטל את ההזמנה...\`)) return`
  - שורה 517: `confirm(...)` לפני מחיקה
- **שורות 649-675:** ShopTab – כפתורי בחירת מוצר בלי `aria-pressed` או `aria-selected`.

### `ClassSchedule.jsx` (athlete) – 🟠

- 4 מופעי alert/confirm.

### `ProductDetail.jsx` – 🟠 (לא נבדק לעומק)

### `AthleteManagement.jsx` (trainer) – 🔴

- **16 מופעי alert/confirm.**
- שורות 346-374: כפתורי סניף עם `✓` בלבד – דורש `aria-label` תיאורי.
- שורה 380-381: `<input placeholder="חיפוש..." />` בלי label בכלל.
- Modals (שורות 384-456) בלי `role="dialog"`, focus management, ESC handler.

### `TodayClasses.jsx` (trainer) – 🔴

- **24 מופעי alert/confirm – הקובץ הכי בעייתי.**

### `ShopManager.jsx` – 🔴

- 7 מופעי alert/confirm.
- שורה 547: `<img alt="preview" />` – `alt` לא תיאורי. תקן ל-`alt={`תצוגה מקדימה: ${form.title || 'ללא שם'}`}`.
- טפסים מרובים – `<fieldset>` חסר עבור קבוצות שדות (מידות, צבעים).

### `AnnouncementsManager.jsx` – 🔴

- שורה 270: `<img alt="preview" />` – אותו תיקון.
- שורות 197-204: רדיו בלי `<fieldset>`/`<legend>`.

### `ImportAthletes.jsx` – 🔴

- Modal (שורה 172-307) בלי `role="dialog"`, `aria-modal`, `aria-labelledby`.

### `LeadsManager.jsx`, `CoachesManager.jsx`, `ProductRequests.jsx`, `ProfileChangeRequests.jsx`, `ReportsManager.jsx`, `TrainerProfile.jsx`, `TrainerDashboard.jsx` – 🟠

- כשלים דומים, פחות חמורים. תיקונים יבואו אחרי שמסיימים את ה-Top 3 (G1, G2, G3).

---

## פתרונות מומלצים – Reusable Components

לפני התיקונים בקבצים – אני ממליץ ליצור שלוש קומפוננטות עזר ו-hook אחד. זה יחתוך 80% מהעבודה.

### `src/components/a11y/Modal.jsx`
```jsx
import { useEffect, useRef } from 'react'

export default function Modal({ open, onClose, title, children, actions }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement
    dialogRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previousFocus?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="bg-white rounded-2xl max-w-md w-full p-6 outline-none"
        onClick={e => e.stopPropagation()}
      >
        <h2 id="modal-title" className="text-lg font-bold mb-3">{title}</h2>
        <div className="text-sm text-gray-700 mb-4">{children}</div>
        <div className="flex gap-2 justify-end">{actions}</div>
      </div>
    </div>
  )
}
```

### `src/components/a11y/Toast.jsx`
```jsx
export default function Toast({ message, type = 'info' }) {
  if (!message) return null
  const color = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-emerald-600' : 'bg-gray-800'
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed bottom-20 right-4 left-4 mx-auto max-w-sm ${color} text-white rounded-lg px-4 py-3 shadow-lg z-50`}
    >
      {message}
    </div>
  )
}
```

### `src/components/a11y/Field.jsx`
```jsx
import { useId } from 'react'

export default function Field({ label, error, required, children, hint }) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const child = children(id, {
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined,
    'aria-required': required ? 'true' : undefined,
    required,
  })
  return (
    <div>
      <label htmlFor={id} className="text-xs font-semibold text-gray-700 block mb-1">
        {label}{required && <span aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (חובה)</span>}
      </label>
      {child}
      {hint && <p id={hintId} className="text-xs text-gray-500 mt-1">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
```

שימוש:
```jsx
<Field label="שם מלא" required error={errors.name}>
  {(id, props) => (
    <input id={id} {...props} type="text" value={name} onChange={e => setName(e.target.value)}
      className="w-full border rounded-lg px-3 py-2" />
  )}
</Field>
```

### `src/lib/useConfirm.js` – החלפה ל-confirm()
hook שמחזיר Promise ופותח Modal עם כפתורי אישור/ביטול נגישים.

---

## Roadmap יישום

### שלב 1 – חוסמי שיגור (סדר עדיפות גבוה ביותר, ~10-15 שעות עבודה)

1. הוסף `lang="he" dir="rtl"` ל-`index.html`. (5 דק')
2. צור `Modal`, `Toast`, `Field`, `useConfirm`. (2-3 שעות)
3. החלף את כל 77 ה-`alert/confirm` ל-Toast/Modal. (~4-5 שעות, גרפ אחד פר קובץ)
4. החלף את כל ה-labels באפליקציה ל-`Field`. (~3-4 שעות)
5. עטוף את ה-error messages ב-`role="alert"`. (1 שעה)
6. הוסף Skip Link + `<main id="main-content">`. (15 דק')
7. תקן ניגודיות `text-gray-400` → `text-gray-600` בכל הפרויקט. (30 דק' עם find&replace)

### שלב 2 – ARIA וסמנטיקה (5-7 שעות)

8. תקן `BottomNav` – `aria-label`, `aria-current`, `aria-hidden` לאייקונים.
9. תקן Modals קיימים (`ImportAthletes`, `ShopManager`) ל-`role="dialog"`.
10. תקן radio groups ל-`<fieldset><legend>`.
11. תקן `<img alt="preview">` לתיאורים אמיתיים.
12. הוסף `aria-pressed` לכפתורי toggle (סניפים, חנות).

### שלב 3 – שיפורים סופיים (3-5 שעות)

13. בדוק כל מסך עם NVDA או VoiceOver.
14. הריץ Lighthouse Accessibility audit – יעד 95+.
15. הוסף הגדרות נגישות: הגדלת טקסט, ניגודיות גבוהה (אופציונלי, לא דרישת חוק).

### שלב 4 – חוקי

16. צור דף `/accessibility` עם הצהרת נגישות (תבנית בקובץ נפרד).
17. הוסף קישור להצהרה בתחתית הסרגל בתחתון/בפרופיל.
18. בחן יועץ נגישות מוסמך לפני העלאה לאוויר. עלות צפויה: 3,000-8,000 ₪ + מע"מ 18%.

### זמן כולל מוערך

- שלב 1: 10-15 שעות
- שלב 2: 5-7 שעות
- שלב 3: 3-5 שעות
- שלב 4: יום עבודה + תיאום עם יועץ
- **סה"כ:** 20-30 שעות פיתוח + יום עבודה אדמיניסטרטיבי

---

## כלי בדיקה אוטומטיים מומלצים

הוסף ל-`package.json`:
```json
"devDependencies": {
  "eslint-plugin-jsx-a11y": "^6.10.0"
}
```

`eslint.config.js`:
```js
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  {
    plugins: { 'jsx-a11y': jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
    }
  }
]
```

זה יראה לך warnings ב-IDE כל פעם שתפר נגישות.

בנוסף:
- **Lighthouse** (Chrome DevTools) – אודיט אוטומטי, לרוץ אחרי כל שלב.
- **axe DevTools** (extension חינמי) – מזהה בעיות ARIA בזמן אמת.
- **NVDA** (Windows) או **VoiceOver** (macOS – ⌘+F5) – לבדיקה ידנית.

---

## הערה משפטית

אני לא עורך דין ולא יועץ נגישות מוסמך. הדוח הזה מבוסס על קריאת הקוד שלך וההנחיות הציבוריות של ת"י 5568 ו-WCAG 2.1. לפני העלאה לאוויר מסחרית – שווה ההשקעה לבדיקה רשמית מטעם יועץ נגישות מוסמך מטעם משרד המשפטים.

קישור רשמי: [נציבות שוויון זכויות לאנשים עם מוגבלות](https://www.gov.il/he/departments/equal_rights_commission_for_persons_with_disabilities)
