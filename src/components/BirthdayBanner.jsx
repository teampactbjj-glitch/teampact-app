import { useEffect, useState } from 'react'

// באנר יום הולדת צף 🎂 — מוצג לחוגג עצמו ביום ההולדת שלו (לפי תאריך מקומי).
// מופיע פעם אחת ביום (נשמר ב-localStorage), נעלם אוטומטית אחרי 12 שניות
// או בלחיצה על ✕. משותף לממשק המתאמן (members.birth_date) ולממשק
// המאמן (coaches.birth_date).
function isBirthdayToday(birthDate) {
  if (!birthDate) return false
  const parts = String(birthDate).slice(0, 10).split('-').map(Number)
  const m = parts[1]
  const d = parts[2]
  if (!m || !d) return false
  const now = new Date()
  return now.getMonth() + 1 === m && now.getDate() === d
}

export default function BirthdayBanner({ name, birthDate, userId }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isBirthdayToday(birthDate)) return
    const today = new Date()
    const dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`
    const storageKey = `birthday_banner_${userId || 'me'}_${dateKey}`
    try {
      if (window.localStorage.getItem(storageKey)) return
      window.localStorage.setItem(storageKey, '1')
    } catch {
      // localStorage חסום (גלישה פרטית וכו') — מציגים בכל זאת
    }
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 12000)
    return () => clearTimeout(t)
  }, [birthDate, userId])

  if (!visible) return null

  const firstName = (name || '').trim().split(/\s+/)[0] || ''

  return (
    <div dir="rtl" className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-md">
      <div className="bg-gradient-to-br from-pink-500 via-rose-500 to-red-600 text-white rounded-2xl shadow-2xl px-4 py-4 flex items-center gap-3 animate-[bounce_1s_ease-in-out_2]">
        <span className="text-3xl" aria-hidden="true">🎂</span>
        <div className="flex-1 text-right">
          <p className="font-black text-base leading-tight">
            יום הולדת שמח{firstName ? `, ${firstName}` : ''}! 🎉
          </p>
          <p className="text-xs text-pink-100 mt-1">
            כל מועדון TeamPact Academy מאחל לך יום מדהים 🥳
          </p>
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-white/80 hover:text-white text-lg px-1 shrink-0"
          aria-label="סגור ברכת יום הולדת"
        >✕</button>
      </div>
    </div>
  )
}
