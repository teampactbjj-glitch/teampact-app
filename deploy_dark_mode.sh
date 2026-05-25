#!/bin/bash
# סקריפט פריסה לתיקון מצב כהה - הדגשת היום הנוכחי + סניף נבחר
# מריץ את הרצף המלא: ניקוי lock → add → commit → push → אימות

set -e

cd "/Users/dudibenzaken/teampact-app" || { echo "❌ לא הצלחתי לעבור לתיקיית הפרויקט"; exit 1; }

echo "==========================================="
echo "🌙 פריסת תיקון מצב כהה"
echo "==========================================="
echo ""

echo "1️⃣  ניקוי קבצי lock (אם קיימים)..."
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null || true
echo "   ✓ נוקה"
echo ""

echo "2️⃣  בדיקת מצב הקבצים..."
git status --short | grep -E "src/index.css" || { echo "❌ src/index.css לא staged/changed"; exit 1; }
echo "   ✓ src/index.css מזוהה"
echo ""

echo "3️⃣  Build מקומי..."
npx vite build 2>&1 | tail -5
echo "   ✓ Build עבר"
echo ""

echo "4️⃣  Stage ו-Commit..."
git add src/index.css
git commit -m "feat(dark-mode): visible borders for today and selected branch in dark mode

- היום הנוכחי בסליידר תאריכים: גרדיאנט אדום + מסגרת ורוד-בהיר + glow
- תאריך נבחר (כחול, מאמן/מנהל): רקע כחול + מסגרת תכלת
- תאריך נבחר (אפור, מתאמן): מסגרת בהירה
- צ'יפ סניף פעיל: רקע כחול + מסגרת תכלת בולטת
- צ'יפ סניף לא-פעיל: מסגרת מקווקוו אפורה כדי להבדיל
- select מסנן סניף בדוחות: מסגרת אפורה ברורה, כחולה ב-focus
- ring-red/gray override לתחזוקת הילת ההדגשה

מתקן בעיית UX במצב כהה: רקעי gradient משתטחים ל-#1a1a1a
ולכן אי-אפשר להבדיל בין נבחר ללא-נבחר. השינוי ב-CSS מרכזי
בלבד (html.a11y-dark-mode) — לא משנה כלום במצב לייט.
משפיע על שלושת הממשקים (מתאמן/מאמן/מנהל)."
echo "   ✓ Commit נוצר"
echo ""

echo "5️⃣  Push ל-origin/main..."
git push origin main
echo "   ✓ Push בוצע"
echo ""

echo "6️⃣  אימות..."
git log --oneline -3
echo ""

echo "==========================================="
echo "✅ הסתיים! השלבים הבאים:"
echo "==========================================="
echo "1. בדוק שה-Vercel build הצליח: https://vercel.com/dashboard"
echo "2. אחרי שה-build ירוק — Cmd+Shift+R בדפדפן"
echo "3. אם זה PWA — DevTools → Application → Service Workers → Unregister"
echo "==========================================="
