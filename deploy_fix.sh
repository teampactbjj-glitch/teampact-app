#!/bin/bash
# סקריפט לפריסת תיקון effectiveCount
# מריץ אחד-אחד עם בדיקות

set -e  # עצור על שגיאה

cd "/Users/dudibenzaken/teampact-app" || { echo "❌ לא הצלחתי לעבור לתיקיית הפרויקט"; exit 1; }

echo "==========================================="
echo "🔧 פריסת תיקון מסך שחור"
echo "==========================================="
echo ""

# שלב 1: ניקוי lock
echo "1️⃣  ניקוי קבצי lock..."
rm -f .git/index.lock .git/HEAD.lock 2>/dev/null || true
echo "   ✓ נוקה"
echo ""

# שלב 2: בדיקת מצב
echo "2️⃣  בודק מה ב-staging..."
STAGED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
echo "   📋 קבצים ב-staging: $STAGED_COUNT"
if [ "$STAGED_COUNT" -eq 0 ]; then
  echo "   📝 מוסיף קבצים ל-staging..."
  git add MEMORY.md \
    src/App.jsx \
    src/components/athlete/AthleteDashboard.jsx \
    src/components/athlete/ClassSchedule.jsx \
    src/components/auth/TrainerLogin.jsx \
    src/components/trainer/AnnouncementsManager.jsx \
    src/components/trainer/LeadsManager.jsx \
    src/components/trainer/ProductRequests.jsx \
    src/components/trainer/ProfileChangeRequests.jsx \
    src/components/trainer/TodayClasses.jsx \
    src/lib/push.js \
    supabase/migrations/class_registrations_per_week.sql
  STAGED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
  echo "   ✓ נוסף, עכשיו $STAGED_COUNT קבצים"
fi
echo ""

# שלב 3: Commit
echo "3️⃣  יוצר קומיט..."
git commit -m "fix(athlete): scope effectiveCount inside ScheduleTab + week_start filter

- AthleteDashboard: move effectiveCount/effectiveCountNext into ScheduleTab
  scope to fix 'effectiveCount is not defined' production runtime error.
- Add next-week registration support with registrationsNext set.
- ClassSchedule: filter class_registrations by week_start.
- App.jsx: race-condition guard + ServiceWorker cleanup.
- TodayClasses: filter soft-deleted members from class counts.
- TrainerLogin: normalize email on signin.
- supabase migration: UNIQUE on (athlete_id, class_id, week_start)."

echo "   ✓ קומיט נוצר"
echo ""

# שלב 4: בדיקה שזה באמת נוצר
echo "4️⃣  מוודא שהקומיט תקף..."
LATEST_COMMIT=$(git log -1 --oneline)
echo "   📌 הקומיט האחרון: $LATEST_COMMIT"
if [[ "$LATEST_COMMIT" == *"effectiveCount"* ]]; then
  echo "   ✓ הקומיט מכיל את התיקון"
else
  echo "   ❌ הקומיט לא נוצר נכון!"
  exit 1
fi
echo ""

# שלב 5: Push
echo "5️⃣  דוחף ל-GitHub..."
git push origin main
echo "   ✓ נדחף בהצלחה!"
echo ""

# שלב 6: וידוא סופי
echo "6️⃣  וידוא סופי..."
BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")
AHEAD=$(git rev-list origin/main..HEAD --count 2>/dev/null || echo "0")
echo "   ה-local מקדים את origin ב-$AHEAD, מאחור ב-$BEHIND"
if [ "$AHEAD" = "0" ] && [ "$BEHIND" = "0" ]; then
  echo "   ✓ הכל מסונכרן עם GitHub!"
fi
echo ""

echo "==========================================="
echo "✅ הצליח! Vercel יתחיל deploy תוך כמה שניות"
echo "==========================================="
echo ""
echo "🌐 בדוק את הדפלוי ב: https://vercel.com/dashboard"
echo "⏱️  אחרי ~1-2 דקות, רענן את האפליקציה ב-iPhone"
