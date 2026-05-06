-- Migration: הוספת ערך '1x_week' למגבלת ה-CHECK של subscription_type
-- מטרה: לאפשר מנוי "פעם בשבוע" (באישור מנהל) בטופס ההצטרפות ובכל מקום במערכת.
-- בטוח לכל סכמה — בודק קודם שכל עמודה קיימת לפני שמוסיף constraint.
-- בטוח להרצה חוזרת (idempotent).

-- 1) members.subscription_type — מקור האמת
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'subscription_type'
  ) THEN
    EXECUTE 'ALTER TABLE members DROP CONSTRAINT IF EXISTS members_subscription_type_check';
    EXECUTE 'ALTER TABLE members ADD  CONSTRAINT members_subscription_type_check
      CHECK (subscription_type IS NULL OR subscription_type IN (''1x_week'', ''2x_week'', ''4x_week'', ''unlimited''))';
  END IF;
END $$;

-- 2) members.membership_type (אם קיימת — תאימות לאחור)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'membership_type'
  ) THEN
    EXECUTE 'ALTER TABLE members DROP CONSTRAINT IF EXISTS members_membership_type_check';
    EXECUTE 'ALTER TABLE members ADD  CONSTRAINT members_membership_type_check
      CHECK (membership_type IS NULL OR membership_type IN (''1x_week'', ''2x_week'', ''4x_week'', ''unlimited''))';
  END IF;
END $$;

-- 3) profiles.subscription_type (אם קיימת — לגאסי)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'subscription_type'
  ) THEN
    EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_type_check';
    EXECUTE 'ALTER TABLE profiles ADD  CONSTRAINT profiles_subscription_type_check
      CHECK (subscription_type IS NULL OR subscription_type IN (''1x_week'', ''2x_week'', ''4x_week'', ''unlimited''))';
  END IF;
END $$;
