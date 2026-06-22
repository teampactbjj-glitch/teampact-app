import { supabase } from './supabase'

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

// תחילת השבוע (ראשון) של תאריך נתון — אותה קונבנציה כמו הרישומים
function weekStartStr(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

// מבטל רישומים + צ'ק-אינים עתידיים בלבד (כולל ימים עתידיים בשבוע הנוכחי),
// לעולם לא נוגע בעבר/היום. מבוסס על תאריך ההופעה האמיתי של כל שיעור,
// כדי שלא יישארו רישומים עתידיים בשבוע הנוכחי וגם שלא תימחק נוכחות עבר.
export async function cancelFutureBookings(memberId, fromDate) {
  const today = todayStr()
  const cutoff = fromDate && fromDate > today ? fromDate : today

  // 1) צ'ק-אינים עתידיים — לפי checkin_date מדויק (עבר/היום נשמרים)
  await supabase.from('checkins').delete()
    .eq('athlete_id', memberId).eq('status', 'present').gt('checkin_date', cutoff)

  // 2) רישומים — מחשבים את תאריך ההופעה האמיתי ומוחקים רק את העתידיים
  const { data: regs } = await supabase.from('class_registrations')
    .select('id, class_id, week_start')
    .eq('athlete_id', memberId)
    .gte('week_start', weekStartStr(cutoff))
  if (!regs || regs.length === 0) return

  const classIds = [...new Set(regs.map(r => r.class_id).filter(Boolean))]
  if (classIds.length === 0) return
  const { data: classes } = await supabase.from('classes')
    .select('id, day_of_week').in('id', classIds)
  const dowMap = new Map((classes || []).map(c => [c.id, c.day_of_week]))

  const toDelete = []
  for (const r of regs) {
    const dow = dowMap.get(r.class_id)
    if (dow == null || !r.week_start) continue
    const ws = new Date(r.week_start + 'T00:00:00')
    const offset = ((dow - ws.getDay() + 7) % 7)
    const occ = new Date(ws); occ.setDate(occ.getDate() + offset)
    const occStr = `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}-${String(occ.getDate()).padStart(2, '0')}`
    if (occStr > cutoff) toDelete.push(r.id)  // רק עתיד — אחרי היום
  }
  if (toDelete.length) {
    await supabase.from('class_registrations').delete().in('id', toDelete)
  }
}
