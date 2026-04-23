# 🚨 משהו נשבר — מה עושים?

מדריך בעברית, צעד אחר צעד. בחר את התרחיש שמתאים לך.

---

## תרחיש 1: "הוספתי תכונה חדשה ומשהו אחר נשבר"

**הכי נפוץ. הפתרון: לחזור לקוד הקודם.**

### אם הבעיה התחילה מהעדכון האחרון
```bash
cd ~/teampact-app
git checkout main
git pull
git revert HEAD --no-edit
git push
```

Vercel יעלה אוטומטית את הגרסה המתוקנת תוך ~2 דקות.
בדוק ב-https://teampact-app.vercel.app שהכל עובד.

### אם אתה לא בטוח איזה commit שבר
```bash
git log --oneline -20
```
תראה 20 commits אחרונים. מצא את זה שגרם לבעיה (לפי ההודעה/תאריך) והעתק את ה-SHA (7 תווים ראשונים).
```bash
git revert <SHA> --no-edit
git push
```

### בדיקה שהשחזור הצליח
1. המתן 2-3 דקות
2. פתח https://teampact-app.vercel.app
3. בדוק שהתכונה שעבדה אתמול — עובדת שוב

---

## תרחיש 2: "מחקתי בטעות תלמיד / שיעור / תשלום / הכרזה"

**הכל עדיין שם! הוספנו soft-delete — המחיקה רק מסתירה, לא מוחקת.**

### שלב א: למצוא את השורה שנמחקה
היכנס ל-Supabase:
https://supabase.com/dashboard/project/pnicoluujpidguvniwub/sql/new

הדבק את זה (החלף `<table>` לשם הטבלה — `members`, `classes`, `announcements`, `product_orders`, או `coaches`):

```sql
select id, deleted_at, *
from public.<table>
where deleted_at is not null
order by deleted_at desc
limit 20;
```

העתק את ה-`id` של השורה שרצית להציל (UUID ארוך).

### שלב ב: להחזיר אותה
```sql
select public.restore_soft_deleted('public.<table>'::regclass, '<row-uuid>'::uuid);
```

זהו. השורה חזרה לאפליקציה.

**טבלאות עם soft-delete:** `members`, `classes`, `announcements`, `product_orders`, `coaches`.

---

## תרחיש 3: "מי לעזאזל עשה את זה?"

**לכל פעולה יש רישום. audit_log יודע הכל.**

ב-Supabase SQL Editor:
```sql
select at, actor_id, op, table_name, row_id, old_row, new_row
from public.audit_log
where table_name = '<table>'
  and row_id = '<row-uuid>'
order by at desc;
```

תראה את כל ההיסטוריה של אותה שורה — מי ערך, מתי, ומה היה הערך הקודם.

---

## תרחיש 4: אסון אמיתי — "כל ה-DB נמחק / Supabase נעלם"

**נדיר מאוד. יש לנו גיבוי כל 4 שעות ב-GitHub.**

⚠ **אל תעשה את זה לבד בפעם הראשונה.** תתקשר/תכתוב לי קודם.

הגיבויים נמצאים ב:
https://github.com/teampactbjj-glitch/teampact-backups

כל תיקייה `snapshots/YYYY-MM-DD_HHMM/` היא תמונת מצב מלאה (DB + קבצים).

תהליך השחזור מתועד בפירוט ב-`docs/BACKUP_AND_RECOVERY.md` (תרחישים C ו-D).
בקרוב אוסיף גם סקריפט אוטומטי — `scripts/restore-from-backup.sh`.

---

## מה לא לעשות לעולם

- ❌ **אל תמחק** את `~/teampact-app` מהמחשב — זה העותק המקומי של הקוד
- ❌ **אל תרוץ** `git push --force` על `main`
- ❌ **אל תעבוד** ישירות על טבלאות production ב-Supabase ללא גיבוי טרי
- ❌ **אל תשתף** את `SUPABASE_SERVICE_ROLE_KEY` או `SUPABASE_DB_URL` — זה כמו סיסמת אדמין

---

## צריך עזרה?
פתח chat חדש עם Claude Code מתוך `~/teampact-app` ושלח:
> "תקרא את `docs/PANIC.md` ואת `docs/BACKUP_AND_RECOVERY.md`, יש לי בעיה: [תיאור]"
