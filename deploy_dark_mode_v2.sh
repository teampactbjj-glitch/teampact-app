#!/bin/bash
# פריסה: ריכוך האדום במצב כהה — מאדום זוהר לאדום-יין רגוע
set -e
cd "/Users/dudibenzaken/teampact-app" || exit 1

echo "🌙 ריכוך אדום במצב כהה"
echo "==========================================="

echo "1️⃣  ניקוי lock..."
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null || true

echo "2️⃣  Build..."
npx vite build 2>&1 | tail -3

echo "3️⃣  Commit ו-Push..."
git add src/index.css
git commit -m "fix(dark-mode): soften the burning red on today highlight

החלפת אדום זוהר #dc2626 + מסגרת ורוד-בהיר #fecaca
באדום-יין כהה ועדין — #5b1717 -> #2a0808 עם מסגרת #991b1b.
הצללה רכה יותר, הפסקת ה-glow הוורוד שצורב את העיניים."
git push origin main

echo "4️⃣  אימות..."
git log --oneline -3
echo ""
echo "✅ Done. Vercel build → Cmd+Shift+R → אם PWA: Unregister Service Worker."
