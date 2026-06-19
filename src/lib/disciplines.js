// ============================================================
// זיהוי תחום לחימה — לוגיקה משותפת לכל הממשקים
// ============================================================
// חולץ מ-ReportsManager כדי שגם הלוז (מתאמן/מאמן) וכל מסך אחר ישתמשו
// באותה לוגיקה בדיוק. אם משנים כאן — משתנה בכל המקומות.
// ============================================================

export function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[׳״'’“”"`]/g, '')        // כל סוגי הגרשים
    .replace(/[\s\-_·.,]+/g, '')        // רווחים ומפרידים
}

// זיהוי תחום לפי שם הקבוצה/שיעור.
// סדר הבדיקות חשוב: MMA קודם ל-Muay Thai קודם ל-BJJ.
export function detectDiscipline(nameRaw = '') {
  const n = normalize(nameRaw)
  if (!n) return 'אחר'

  // ילדים — קבוצת לחימה משולבת לגיל 3-6
  if (/3.?6/.test(n)) return 'ילדים'

  // MMA / לחימה משולבת
  if (/(^|[^a-z])mma([^a-z]|$)|mixedmartial|אםאםאיי|לחימהמשולבת|לחימהמעורבת|קרבמשולב|קרבמעורב|משולב|מעורב/.test(n)) return 'MMA'

  // Muay Thai / איגרוף תאילנדי / קיקבוקס
  if (/muaythai|muay|מואיטאי|מואיתאי|מואי|מויטאי|איגרוףתאילנדי|אגרוףתאילנדי|איגרוףתאי|אגרוףתאי|תאילנדי|תאילנד|kickbox|קיקבוקס|טאיבוקס/.test(n)) return 'Muay Thai'

  // BJJ — כל הצורות
  if (/bjj|jiujitsu|jujitsu|jiu|jitsu|גיוגיטסו|גוגיטסו|גיוגי|גיטסו|נוגי|nogi|גראפלינג|גרפלינג|grappling|ברזיל|brazil|openmat|אופנמט|אופןמט/.test(n)) return 'BJJ'

  // "גי" כמילה עצמאית
  if (/(^|\s)גי(\s|$)/.test(String(nameRaw))) return 'BJJ'

  // ברירת מחדל ל-Team Pact (אקדמיית BJJ): שיעורים גנריים = BJJ
  if (/מתחילים|מתחיל|מתקדמים|מתקדם|בינוני|כחול|סגול|חום|שחור|חגורה|נשים|נשי|adult|adv|beg|kids|ילדים|נוער|טף/.test(n)) return 'BJJ'

  return 'אחר'
}

// תחום של שיעור: לפי class_type מפורש (אם קיים ואינו 'regular'), אחרת לפי השם.
export function classDiscipline(cls) {
  const explicit = (cls?.class_type || '').toLowerCase()
  if (explicit && explicit !== 'regular') {
    const fromExplicit = detectDiscipline(explicit)
    if (fromExplicit !== 'אחר') return fromExplicit
  }
  return detectDiscipline(cls?.name || '')
}

export const DISCIPLINE_ORDER = ['BJJ', 'Muay Thai', 'MMA', 'ילדים', 'אחר']

export const DISCIPLINE_COLORS = {
  'BJJ': '#2563eb',
  'Muay Thai': '#dc2626',
  'MMA': '#7c3aed',
  'ילדים': '#f59e0b',
  'אחר': '#6b7280',
}

// תוויות תצוגה (כפתורי סינון). מפתחות = הערכים מ-detectDiscipline.
export const DISCIPLINE_LABELS = {
  'BJJ': "ג'יו-ג'יטסו",
  'Muay Thai': 'איגרוף תאילנדי',
  'MMA': 'MMA / לחימה משולבת',
  'ילדים': 'ילדים',
  'אחר': 'אחר',
}
