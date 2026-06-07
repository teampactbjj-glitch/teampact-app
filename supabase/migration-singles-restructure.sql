-- ============================================================================
-- TeamPact — פירוק החנות למוצרים בודדים + 2 קומבו עם הנחה
-- תאריך: 2026-06-06
-- מה הסקריפט עושה (טרנזקציה אחת, בלי לאבד מלאי):
--   1. יוצר טבלאות גיבוי בתוך ה-DB (לשחזור מלא במקרה הצורך).
--   2. יוצר מוצרים בודדים חדשים: "מכנס" (180) ו"חגורה" (100).
--   3. הופך את מוצר "נו-גי" ל"ראשגארד" (150) ומעביר אליו את מלאי הראשגארד.
--   4. מעביר את מלאי המכנס (110) למוצר מכנס, ואת מלאי החגורה (42) למוצר חגורה.
--   5. ממזג את שני הגרידים של החליפה (null + "חליפה") למלאי אחד נקי (~137), בלי איבוד.
--   6. מגדיר 2 אופציות קומבו:
--        - חליפה + חגורה = 600 (מוריד מחליפה ומחגורה)
--        - סט מכנס + ראשגארד = 300 (מוריד ממכנס ומראשגארד)
--   7. הופך את התיק למוצר בודד (350) ומסיר את כל שאר החבילות.
--
-- ⚠️ להריץ ב-Supabase SQL Editor. הכל עטוף ב-DO block (טרנזקציה) — אם משהו נכשל,
--    שום שינוי לא מוחל. טבלאות הגיבוי נוצרות לפני, ונשארות לשחזור.
-- ============================================================================

-- ── 1. גיבוי מלא בתוך ה-DB ──────────────────────────────────────────────────
DROP TABLE IF EXISTS backup_variants_20260606;
DROP TABLE IF EXISTS backup_announcements_20260606;
CREATE TABLE backup_variants_20260606     AS SELECT * FROM product_variants;
CREATE TABLE backup_announcements_20260606 AS SELECT * FROM announcements;

-- ── 2-7. המיגרציה עצמה ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_suit uuid := '5c91e303-9ecf-40e9-8357-ebb510799c81'; -- חליפת גיו גיטסו
  v_nogi uuid := '2efdb811-2a40-412c-965a-50c180a3d6c8'; -- נו-גי → יהפוך לראשגארד
  v_bag  uuid := '4d7d3cab-e89b-4cd9-a3f7-a79a3c6a165e'; -- תיק
  v_michnas uuid;
  v_belt    uuid;
BEGIN
  -- 2a. מוצר חדש: מכנס
  INSERT INTO announcements (type, title, price, has_variants, purchase_options, available_sizes, available_colors)
  VALUES ('product', 'TeamPact מכנס', 180, true,
          jsonb_build_array(jsonb_build_object('name','מכנס','price',180)),
          '{}'::text[], '{}'::text[])
  RETURNING id INTO v_michnas;

  -- העברת מלאי המכנס מנו-גי → מוצר מכנס, ושיטוח component_name ל-null
  UPDATE product_variants
     SET product_id = v_michnas, component_name = NULL
   WHERE product_id = v_nogi AND component_name = 'מכנס';

  -- 2b. מוצר חדש: חגורה
  INSERT INTO announcements (type, title, price, has_variants, purchase_options, available_sizes, available_colors)
  VALUES ('product', 'TeamPact חגורה', 100, true,
          jsonb_build_array(jsonb_build_object('name','חגורה','price',100)),
          '{}'::text[], '{}'::text[])
  RETURNING id INTO v_belt;

  -- העברת מלאי החגורה מהחליפה → מוצר חגורה
  UPDATE product_variants
     SET product_id = v_belt, component_name = NULL
   WHERE product_id = v_suit AND component_name = 'חגורה';

  -- 3. נו-גי → ראשגארד: שיטוח מלאי הראשגארד ל-null
  UPDATE product_variants
     SET component_name = NULL
   WHERE product_id = v_nogi AND component_name = 'ראשגארד';

  -- 5. מיזוג שני הגרידים של החליפה (null + 'חליפה') בלי איבוד מלאי:
  --    א) הוספת מלאי דלי 'חליפה' לשורת ה-null התואמת (אותה מידה/צבע/אורך)
  UPDATE product_variants n
     SET stock = COALESCE(n.stock,0) + COALESCE(c.stock,0)
    FROM product_variants c
   WHERE c.product_id = v_suit AND c.component_name = 'חליפה'
     AND n.product_id = v_suit AND n.component_name IS NULL
     AND COALESCE(n.size,'')   = COALESCE(c.size,'')
     AND COALESCE(n.color,'')  = COALESCE(c.color,'')
     AND COALESCE(n.length,'') = COALESCE(c.length,'');
  --    ב) שורות 'חליפה' שאין להן תאומה ב-null → הפיכה ל-null (שמירת המלאי)
  UPDATE product_variants c
     SET component_name = NULL
   WHERE c.product_id = v_suit AND c.component_name = 'חליפה'
     AND NOT EXISTS (
       SELECT 1 FROM product_variants n
        WHERE n.product_id = v_suit AND n.component_name IS NULL AND n.id <> c.id
          AND COALESCE(n.size,'')   = COALESCE(c.size,'')
          AND COALESCE(n.color,'')  = COALESCE(c.color,'')
          AND COALESCE(n.length,'') = COALESCE(c.length,''));
  --    ג) מחיקת שורות 'חליפה' שכבר מוזגו (נשארו עם component_name='חליפה')
  DELETE FROM product_variants
   WHERE product_id = v_suit AND component_name = 'חליפה';

  -- 3+6. עדכון מוצר ראשגארד (לשעבר נו-גי): אופציה בודדת + קומבו סט
  UPDATE announcements
     SET title = 'TeamPact ראשגארד', price = 150, has_variants = true,
         purchase_options = jsonb_build_array(
           jsonb_build_object('name','ראשגארד','price',150),
           jsonb_build_object('name','סט מכנס + ראשגארד','price',300,'note','חיסכון 30 ₪','is_featured',true,
             'components', jsonb_build_array(
               jsonb_build_object('name','מכנס','product_id',v_michnas,
                 'sizes',  COALESCE((SELECT to_jsonb(array_agg(DISTINCT size  ORDER BY size))  FROM product_variants WHERE product_id=v_michnas AND size  IS NOT NULL), '[]'::jsonb),
                 'colors', COALESCE((SELECT to_jsonb(array_agg(DISTINCT color))                FROM product_variants WHERE product_id=v_michnas AND color IS NOT NULL), '[]'::jsonb)),
               jsonb_build_object('name','ראשגארד','product_id',v_nogi,
                 'sizes',  COALESCE((SELECT to_jsonb(array_agg(DISTINCT size  ORDER BY size))  FROM product_variants WHERE product_id=v_nogi AND component_name IS NULL AND size  IS NOT NULL), '[]'::jsonb),
                 'colors', COALESCE((SELECT to_jsonb(array_agg(DISTINCT color))                FROM product_variants WHERE product_id=v_nogi AND component_name IS NULL AND color IS NOT NULL), '[]'::jsonb))
             ))
         )
   WHERE id = v_nogi;

  -- 6. עדכון מוצר חליפה: אופציה בודדת + קומבו חליפה+חגורה
  UPDATE announcements
     SET price = 550, has_variants = true,
         purchase_options = jsonb_build_array(
           jsonb_build_object('name','חליפה','price',550),
           jsonb_build_object('name','חליפה + חגורה','price',600,'note','חיסכון 50 ₪','is_featured',true,
             'components', jsonb_build_array(
               jsonb_build_object('name','חליפה','product_id',v_suit,
                 'sizes',  COALESCE((SELECT to_jsonb(array_agg(DISTINCT size))  FROM product_variants WHERE product_id=v_suit AND component_name IS NULL AND size  IS NOT NULL), '[]'::jsonb),
                 'colors', COALESCE((SELECT to_jsonb(array_agg(DISTINCT color)) FROM product_variants WHERE product_id=v_suit AND component_name IS NULL AND color IS NOT NULL), '[]'::jsonb)),
               jsonb_build_object('name','חגורה','product_id',v_belt,
                 'sizes',  COALESCE((SELECT to_jsonb(array_agg(DISTINCT size))  FROM product_variants WHERE product_id=v_belt AND size  IS NOT NULL), '[]'::jsonb),
                 'colors', COALESCE((SELECT to_jsonb(array_agg(DISTINCT color)) FROM product_variants WHERE product_id=v_belt AND color IS NOT NULL), '[]'::jsonb))
             ))
         )
   WHERE id = v_suit;

  -- 7. תיק: מוצר בודד בלבד (הסרת כל החבילות)
  UPDATE announcements
     SET purchase_options = jsonb_build_array(jsonb_build_object('name','תיק','price',350))
   WHERE id = v_bag;

  RAISE NOTICE 'migration done: michnas=% belt=%', v_michnas, v_belt;
END $$;

-- ── בדיקת אימות (להריץ אחרי) ─────────────────────────────────────────────────
-- מלאי לכל מוצר בודד אחרי המיגרציה:
SELECT a.title, COUNT(v.id) AS variants, COALESCE(SUM(v.stock),0) AS total_stock
FROM announcements a
LEFT JOIN product_variants v ON v.product_id = a.id
WHERE a.type='product' AND a.deleted_at IS NULL
GROUP BY a.title
ORDER BY a.title;
