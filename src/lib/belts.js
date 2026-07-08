// ============================================================
// Belt system constants + helpers (BJJ / IBJJF)
// ============================================================

// Adult belts: white → blue → purple → brown → black (with up to 6 dans).
// Stripes: 0-4 for white→brown, 0-6 for black (each stripe ~2-3 years on black).
export const ADULT_BELTS = [
  { value: 'white',         label: 'לבנה',        color: '#FFFFFF', text: '#1f2937', order: 1, maxStripes: 4 },
  { value: 'blue',          label: 'כחולה',       color: '#1d4ed8', text: '#FFFFFF', order: 2, maxStripes: 4 },
  { value: 'purple',        label: 'סגולה',       color: '#7e22ce', text: '#FFFFFF', order: 3, maxStripes: 4 },
  { value: 'brown',         label: 'חומה',        color: '#78350f', text: '#FFFFFF', order: 4, maxStripes: 4 },
  { value: 'black',         label: 'שחורה',       color: '#000000', text: '#FFFFFF', order: 5, maxStripes: 6 },
  { value: 'black_1',       label: 'שחורה - דאן 1', color: '#000000', text: '#FFFFFF', order: 5, maxStripes: 6, dan: 1 },
  { value: 'black_2',       label: 'שחורה - דאן 2', color: '#000000', text: '#FFFFFF', order: 5, maxStripes: 6, dan: 2 },
  { value: 'black_3',       label: 'שחורה - דאן 3', color: '#000000', text: '#FFFFFF', order: 5, maxStripes: 6, dan: 3 },
  { value: 'black_4',       label: 'שחורה - דאן 4', color: '#000000', text: '#FFFFFF', order: 5, maxStripes: 6, dan: 4 },
  { value: 'black_5',       label: 'שחורה - דאן 5', color: '#000000', text: '#FFFFFF', order: 5, maxStripes: 6, dan: 5 },
  { value: 'black_6',       label: 'שחורה - דאן 6', color: '#000000', text: '#FFFFFF', order: 5, maxStripes: 6, dan: 6 },
  { value: 'coral_red_black', label: 'אדומה-שחורה (קורל)', color: '#dc2626', text: '#FFFFFF', order: 6, maxStripes: 0 },
  { value: 'coral_red_white', label: 'אדומה-לבנה (קורל)',  color: '#dc2626', text: '#FFFFFF', order: 7, maxStripes: 0 },
  { value: 'red',           label: 'אדומה',       color: '#991b1b', text: '#FFFFFF', order: 8, maxStripes: 0 },
]

// Kids belts (IBJJF kids ranking system, ages 4-15).
export const KIDS_BELTS = [
  { value: 'kids_white',        label: 'לבנה (ילדים)',         color: '#FFFFFF', text: '#1f2937', order: 1,  maxStripes: 4 },
  { value: 'kids_gray_white',   label: 'אפורה-לבנה',           color: '#9ca3af', text: '#FFFFFF', order: 2,  maxStripes: 4 },
  { value: 'kids_gray',         label: 'אפורה',                color: '#6b7280', text: '#FFFFFF', order: 3,  maxStripes: 4 },
  { value: 'kids_gray_black',   label: 'אפורה-שחורה',          color: '#374151', text: '#FFFFFF', order: 4,  maxStripes: 4 },
  { value: 'kids_yellow_white', label: 'צהובה-לבנה',           color: '#fbbf24', text: '#1f2937', order: 5,  maxStripes: 4 },
  { value: 'kids_yellow',       label: 'צהובה',                color: '#f59e0b', text: '#1f2937', order: 6,  maxStripes: 4 },
  { value: 'kids_yellow_black', label: 'צהובה-שחורה',          color: '#d97706', text: '#FFFFFF', order: 7,  maxStripes: 4 },
  { value: 'kids_orange_white', label: 'כתומה-לבנה',           color: '#fb923c', text: '#1f2937', order: 8,  maxStripes: 4 },
  { value: 'kids_orange',       label: 'כתומה',                color: '#ea580c', text: '#FFFFFF', order: 9,  maxStripes: 4 },
  { value: 'kids_orange_black', label: 'כתומה-שחורה',          color: '#9a3412', text: '#FFFFFF', order: 10, maxStripes: 4 },
  { value: 'kids_green_white',  label: 'ירוקה-לבנה',           color: '#86efac', text: '#1f2937', order: 11, maxStripes: 4 },
  { value: 'kids_green',        label: 'ירוקה',                color: '#16a34a', text: '#FFFFFF', order: 12, maxStripes: 4 },
  { value: 'kids_green_black',  label: 'ירוקה-שחורה',          color: '#14532d', text: '#FFFFFF', order: 13, maxStripes: 4 },
]

const ALL_BELTS_MAP = Object.fromEntries(
  [...ADULT_BELTS, ...KIDS_BELTS].map(b => [b.value, b])
)

// גיל מינימום לקבלת כל חגורת ילדים (לפי IBJJF)
export const KIDS_BELT_MIN_AGE = {
  kids_gray_white:   4,
  kids_gray:         5,
  kids_gray_black:   6,
  kids_yellow_white: 7,
  kids_yellow:       8,
  kids_yellow_black: 9,
  kids_orange_white: 10,
  kids_orange:       11,
  kids_orange_black: 12,
  kids_green_white:  13,
  kids_green:        14,
  kids_green_black:  15,
}
export const KIDS_MIN_MONTHS_AT_BELT = 6

// עודכן 08.07.2026 (סוכם עם דודי): קריטריון "מוכן למבחן דרגות" לילדים עבר
// ממדד לוח-שנה (חודשים מאז החגורה) למדד יחידות אימון אמיתיות (checkins
// בפועל, status='present', מאז קבלת החגורה הנוכחית) — כי לוח שנה לא בודק
// אם הילד באמת הגיע לאימונים. ראו kidsReadyForPromotion ב-ReportsManager.jsx
// + הפונקציה kids_units_since_belt() ב-Supabase (מיגרציה 2026-07-08).
export const KIDS_MIN_TRAINING_UNITS = 50

export function getBeltMeta(beltValue) {
  if (!beltValue) return null
  return ALL_BELTS_MAP[beltValue] || null
}

export function getBeltLabel(beltValue) {
  return getBeltMeta(beltValue)?.label || '—'
}

export function getMaxStripes(beltValue) {
  return getBeltMeta(beltValue)?.maxStripes ?? 4
}

// Hebrew month → number map (matches CSV format like "ינואר 2012")
const HEBREW_MONTHS = {
  'ינואר':1,'פברואר':2,'מרץ':3,'מארס':3,'אפריל':4,'מאי':5,'יוני':6,
  'יולי':7,'אוגוסט':8,'ספטמבר':9,'אוקטובר':10,'נובמבר':11,'דצמבר':12,
}

/**
 * Parses Hebrew "month year" strings like "ינואר 2012" or "יוני 2018".
 * Returns ISO date string (YYYY-MM-01) of the FIRST day of that month, or null.
 *
 * עמיד בפני "מלכודות" של גוגל-שיטס/Excel:
 *   - תווי כיוון בלתי-נראים: RLM (‏), LRM (‎), ZWSP, ZWJ, ZWNJ, BOM
 *   - נון-ברייקינג ספייס ( ) שלא נחתך ע"י .trim()
 *   - הקפדה לפני שפה הוסרים — אחרת ה-regex של אות עברית `[֐-׿]` נכשל.
 */
export function parseHebrewMonthYear(input) {
  if (!input) return null
  const s = String(input)
    // הסרת directional marks ו-zero-width chars שגוגל-שיטס מכניסה לטקסט עברי
    .replace(/[​-‏‪-‮⁠﻿]/g, '')
    // החלפת נון-ברייקינג ספייס ברווח רגיל
    .replace(/ /g, ' ')
    .trim()
  if (!s) return null

  // Try Hebrew "month year"
  const m = s.match(/^([֐-׿]+)\s+(\d{4})$/)
  if (m) {
    const month = HEBREW_MONTHS[m[1]]
    const year = parseInt(m[2], 10)
    if (month && year) {
      return `${year}-${String(month).padStart(2,'0')}-01`
    }
  }

  // Fallback: numeric "MM/YYYY" or "M.YYYY"
  const num = s.match(/^(\d{1,2})[\/\.\-](\d{4})$/)
  if (num) {
    const month = parseInt(num[1], 10)
    const year = parseInt(num[2], 10)
    if (month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2,'0')}-01`
    }
  }

  // Fallback: just year "2018"
  const yearOnly = s.match(/^(\d{4})$/)
  if (yearOnly) {
    return `${yearOnly[1]}-01-01`
  }

  return null
}

/** Years between a date and today. Returns 0 if date is null/invalid. */
export function yearsSince(dateStr) {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return 0
  const ms = Date.now() - d.getTime()
  return ms / (1000 * 60 * 60 * 24 * 365.25)
}

/** "X שנים, Y חודשים" formatting */
export function formatYearsMonths(dateStr) {
  if (!dateStr) return ''
  const start = new Date(dateStr)
  const now = new Date()
  if (isNaN(start.getTime())) return ''
  let years = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  if (months < 0) { years--; months += 12 }
  if (years <= 0 && months <= 0) return 'פחות מחודש'
  const parts = []
  if (years > 0) parts.push(years === 1 ? 'שנה' : `${years} שנים`)
  if (months > 0) parts.push(months === 1 ? 'חודש' : `${months} חודשים`)
  return parts.join(', ')
}

/** Format date as Hebrew "חודש שנה" (e.g. "ינואר 2018") */
export function formatHebrewMonthYear(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const month = d.getMonth() + 1
  const year = d.getFullYear()
  const monthName = Object.entries(HEBREW_MONTHS).find(([_, n]) => n === month)?.[0] || ''
  return `${monthName} ${year}`
}

// ============================================================
// Kids belt families & syllabus helpers
// ============================================================
// משמש למבחן הדרגות השנתי (יוני). מהמיר חגורת ילדים
// (kids_gray_white / kids_gray / kids_gray_black) → משפחה (gray)
// + מיקום במשפחה (entry / mid / top).
// ============================================================

/**
 * Returns the belt family ('gray'/'yellow'/'orange'/'green') for a kids belt,
 * or null for kids_white (no family) and any non-kids belt.
 */
export function getBeltFamily(beltValue) {
  if (!beltValue || typeof beltValue !== 'string') return null
  if (!beltValue.startsWith('kids_')) return null
  if (beltValue === 'kids_white') return null
  if (beltValue.startsWith('kids_gray'))   return 'gray'
  if (beltValue.startsWith('kids_yellow')) return 'yellow'
  if (beltValue.startsWith('kids_orange')) return 'orange'
  if (beltValue.startsWith('kids_green'))  return 'green'
  return null
}

/**
 * Returns the position within the belt family:
 *   'entry' = X-לבנה (kids_gray_white, kids_yellow_white, ...)
 *   'mid'   = X      (kids_gray, kids_yellow, ...)
 *   'top'   = X-שחורה (kids_gray_black, kids_yellow_black, ...)
 *   null    = kids_white or non-family belt
 */
export function getBeltLevelPosition(beltValue) {
  if (!beltValue || typeof beltValue !== 'string') return null
  if (!beltValue.startsWith('kids_')) return null
  if (beltValue === 'kids_white') return null
  if (beltValue.endsWith('_white')) return 'entry'
  if (beltValue.endsWith('_black')) return 'top'
  // אם זה kids_gray, kids_yellow, kids_orange, kids_green בלבד
  return 'mid'
}

/**
 * Belt family Hebrew label (e.g. 'gray' → 'אפורה').
 */
export function getBeltFamilyLabel(family) {
  return ({
    gray:   'אפורה',
    yellow: 'צהובה',
    orange: 'כתומה',
    green:  'ירוקה',
  })[family] || family || ''
}

/**
 * Belt family color (matches Tailwind palette used in KIDS_BELTS).
 */
export function getBeltFamilyColor(family) {
  return ({
    gray:   '#6b7280',
    yellow: '#f59e0b',
    orange: '#ea580c',
    green:  '#16a34a',
  })[family] || '#9ca3af'
}

/**
 * For a target belt (the one being tested toward), returns:
 *   { family, level }
 * which is the syllabus-key needed to look up belt_test_syllabus row + level_notes.
 *
 * Examples:
 *   getSyllabusKeyForTarget('kids_gray_white')  → { family: 'gray',   level: 'entry' }
 *   getSyllabusKeyForTarget('kids_gray')        → { family: 'gray',   level: 'mid'   }
 *   getSyllabusKeyForTarget('kids_gray_black')  → { family: 'gray',   level: 'top'   }
 *   getSyllabusKeyForTarget('kids_yellow_white')→ { family: 'yellow', level: 'entry' }
 *   getSyllabusKeyForTarget('white')            → { family: null,     level: null    }
 */
export function getSyllabusKeyForTarget(targetBelt) {
  return {
    family: getBeltFamily(targetBelt),
    level:  getBeltLevelPosition(targetBelt),
  }
}

/**
 * Hebrew label for a level position.
 */
export function getLevelLabel(level) {
  return ({
    entry: 'דרגת כניסה',
    mid:   'דרגת אמצע',
    top:   'דרגה עליונה',
  })[level] || ''
}
