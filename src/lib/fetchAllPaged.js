// fetchAllPaged — טוען את *כל* השורות מטבלת Supabase בדפדוף.
//
// למה: ל-Supabase/PostgREST יש תקרת ברירת-מחדל של 1000 שורות לכל בקשה.
// קריאה כמו `.range(0, 99999)` *לא* עוקפת את זה — השרת עדיין מחזיר עד 1000,
// ובלי ORDER BY אלה 1000 שורות אקראיות. זה גרם לחישובים שגויים (נוכחות, שכר,
// דרגות) כשמספר השורות חצה 1000. הדפדוף טוען מנות של 1000 עד שמגיע הכל.
//
// שימוש:
//   const { data, error } = await fetchAllPaged(() =>
//     supabase.from('checkins').select('...').eq('status','present').order('checked_in_at'))
//
// חובה:
//   1. makeQuery מחזיר query *חדש* בכל קריאה (פונקציה, לא אובייקט query יחיד).
//   2. ל-query יש order יציב (רצוי עמודה ייחודית) כדי שהדפים לא יחפפו/ידלגו.
export async function fetchAllPaged(makeQuery, pageSize = 1000) {
  let from = 0
  const all = []
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1)
    if (error) return { data: all, error }
    if (data && data.length) all.push(...data)
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return { data: all, error: null }
}
