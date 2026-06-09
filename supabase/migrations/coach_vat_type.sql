-- מיגרציה: סוג עוסק למאמן (לצורך חישוב מע"מ בדוח שכר)
-- murshe = עוסק מורשה — מוציא חשבונית עם מע"מ, מקבל סכום מלא (כולל מע"מ)
-- patur  = עוסק פטור  — לא גובה מע"מ, מקבל סכום ÷ 1.18

BEGIN;

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS vat_type text NOT NULL DEFAULT 'murshe'
  CHECK (vat_type IN ('murshe', 'patur'));

COMMIT;
