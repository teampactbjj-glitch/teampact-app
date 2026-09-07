// עזרי "בחירת חודש" משותפים לדוחות — נשלף מהלוגיקה שכבר הייתה קיימת ב-SalaryReport.jsx
// (recentMonths/monthLabel/monthRange), כדי שכל הדוחות (ReportsManager, BillingReconciliation,
// TrialVisitsByBranch) יתנהגו אותו דבר: בחירת חודש קלנדרי קונקרטי (כולל חודשים קודמים,
// למשל לצפות בדוח אוגוסט כשיושבים בספטמבר) במקום "N ימים אחרונים" מהיום.
// ✅ 07.09.2026 — נבנה בעקבות בקשת דודי: הוא מחשב שכר ומסתכל על דוחות לפי חודש קלנדרי,
// לא לפי "טווח ימים אחורה מהיום".

export function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('he-IL', { year: 'numeric', month: 'long' })
}

// n החודשים האחרונים, כולל החודש הנוכחי, מהחדש לישן (index 0 = החודש הנוכחי)
export function recentMonths(n = 6) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
}

// גבולות מילישניות של חודש קלנדרי: מ-1 בחודש 00:00:00.000 עד היום האחרון בחודש 23:59:59.999
export function monthBoundsMs(year, month) {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime()
  const end = new Date(year, month, 0, 23, 59, 59, 999).getTime()
  return { start, end }
}

// אותן גבולות כמחרוזות תאריך YYYY-MM-DD (לשימוש מול עמודות מסוג date, כמו requested_date)
export function monthRangeStr(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}
