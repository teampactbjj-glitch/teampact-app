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
