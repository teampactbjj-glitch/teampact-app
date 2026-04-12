import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const SUBSCRIPTION_LIMITS = { '2x_week': 2, '4x_week': 4, unlimited: Infinity }
const SUBSCRIPTION_LABELS = { '2x_week': '2× שבוע', '4x_week': '4× שבוע', unlimited: 'ללא הגבלה' }
const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatTime(t) {
  return t ? t.slice(0, 5) : ''
}

function resolveNextOccurrence(cls) {
  const now = new Date()
  const todayDow = now.getDay()
  const [h, m] = (cls.start_time || '00:00').split(':').map(Number)
  const classDow = typeof cls.day_of_week === 'number' ? cls.day_of_week : 0

  let daysUntil = (classDow - todayDow + 7) % 7
  if (daysUntil === 0) {
    const nowMins = now.getHours() * 60 + now.getMinutes()
    if (h * 60 + m <= nowMins) daysUntil = 7
  }

  const nextDate = new Date(now)
  nextDate.setDate(now.getDate() + daysUntil)
  nextDate.setHours(h, m, 0, 0)

  const displayDay = daysUntil === 0 ? 'היום' : daysUntil === 1 ? 'מחר' : `יום ${DAYS_HE[classDow]}`
  const displayTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  return { daysUntil, displayDay, displayTime, nextDate }
}

function computeNextClass(allClasses, regIds) {
  const registered = allClasses.filter(c => regIds.has(c.id))
  if (registered.length === 0) return null
  const withNext = registered.map(cls => ({ cls, ...resolveNextOccurrence(cls) }))
  withNext.sort((a, b) => a.daysUntil - b.daysUntil || a.nextDate - b.nextDate)
  const s = withNext[0]
  return { ...s.cls, displayDay: s.displayDay, displayTime: s.displayTime }
}

export default function AthleteDashboard({ profile }) {
  const [branchId, setBranchId] = useState(null)
  const [subType, setSubType] = useState(null)
  const [membershipEnd, setMembershipEnd] = useState(null)
  const [classes, setClasses] = useState([])
  const [registeredIds, setRegisteredIds] = useState(new Set())
  const [nextClass, setNextClass] = useState(null)
  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [regLoading, setRegLoading] = useState({}) // { classId: bool }
  const [productModal, setProductModal] = useState(null) // announcement item
  const [requestSent, setRequestSent] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)

  useEffect(() => {
    if (profile?.id) fetchAll()
  }, [profile?.id])

  async function fetchAll() {
    setLoading(true)

    // 1. profiles → branch_id (columns: id, full_name, role, branch_id, is_admin, created_at)
    const { data: profileRow, error: profileErr } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', profile.id)
      .maybeSingle()

    console.log('profiles:', profileRow, profileErr)
    const bid = profileRow?.branch_id
    setBranchId(bid)

    // 2. members → subscription_type, membership_end (columns include email, branch_id, subscription_type, membership_end)
    const { data: memberRow, error: memberErr } = await supabase
      .from('members')
      .select('subscription_type, membership_type, membership_end')
      .eq('branch_id', bid)
      .eq('email', profile.email)
      .maybeSingle()

    console.log('members:', memberRow, memberErr)
    setSubType(memberRow?.subscription_type || memberRow?.membership_type || null)
    setMembershipEnd(memberRow?.membership_end || null)

    // 3. registrations + announcements (parallel)
    const [regRes, annRes] = await Promise.all([
      supabase
        .from('class_registrations')
        .select('class_id')
        .eq('athlete_id', profile.id),
      supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    // 4. classes via RPC (includes coach_name)
    const classRes = bid
      ? await supabase.rpc('get_classes_with_coach', { p_branch_id: bid })
      : { data: [], error: null }
    console.log('classRes:', classRes.data, classRes.error)

    const allClasses = classRes.data || []
    const regIds = new Set((regRes.data || []).map(r => r.class_id))

    setClasses(allClasses)
    setRegisteredIds(regIds)
    setAnnouncements(annRes.data || [])
    setNextClass(computeNextClass(allClasses, regIds))

    setLoading(false)
  }

  async function toggleRegistration(classId) {
    const isReg = registeredIds.has(classId)
    const limit = SUBSCRIPTION_LIMITS[subType] ?? 2

    if (!isReg && limit !== Infinity && registeredIds.size >= limit) {
      alert(`הגעת למגבלת ${limit} שיעורים שבועיים לפי המנוי שלך`)
      return
    }

    setRegLoading(p => ({ ...p, [classId]: true }))

    if (isReg) {
      const { error } = await supabase.from('class_registrations').delete()
        .eq('athlete_id', profile.id).eq('class_id', classId)
      if (error) { console.error('unregister error:', error); setRegLoading(p => ({ ...p, [classId]: false })); return }
    } else {
      const { error } = await supabase.from('class_registrations')
        .insert({ athlete_id: profile.id, class_id: classId })
      if (error) { console.error('register error:', error); setRegLoading(p => ({ ...p, [classId]: false })); return }
    }

    const newRegIds = new Set(registeredIds)
    if (isReg) newRegIds.delete(classId)
    else newRegIds.add(classId)
    setRegisteredIds(newRegIds)
    setNextClass(computeNextClass(classes, newRegIds))

    setRegLoading(p => ({ ...p, [classId]: false }))
  }

  async function sendProductRequest(item) {
    setRequestLoading(true)
    const { error } = await supabase.from('product_requests').insert({
      athlete_id: profile.id,
      athlete_name: profile.full_name,
      product_id: item.id,
      product_name: item.title,
    })
    if (error) console.error('product_request error:', error)
    setRequestLoading(false)
    setRequestSent(true)
  }

  function closeProductModal() {
    setProductModal(null)
    setRequestSent(false)
  }

  const limit = SUBSCRIPTION_LIMITS[subType] ?? 2

  // Group all branch classes by day_of_week
  const grouped = DAYS_HE.map((dayName, dow) => ({
    dow,
    dayName,
    classes: classes.filter(c => c.day_of_week === dow),
  })).filter(g => g.classes.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💪</span>
          <div>
            <h1 className="font-bold text-lg leading-none">TeamPact</h1>
            <p className="text-emerald-200 text-xs">שלום, {profile?.full_name}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-emerald-200 hover:text-white text-sm">
          יציאה
        </button>
      </header>

      <main className="p-4 max-w-lg mx-auto space-y-5">
        {loading ? (
          <p className="text-center text-gray-400 py-16">טוען...</p>
        ) : (
          <>
            {/* 1. Subscription card */}
            <div className="bg-white rounded-xl border shadow-sm p-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
                  מנוי: {SUBSCRIPTION_LABELS[subType] || '—'}
                </span>
                <span className="text-sm text-gray-500">
                  {limit === Infinity ? 'ללא הגבלה' : `${registeredIds.size}/${limit} שיעורים`}
                </span>
              </div>
              {limit !== Infinity && (
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      registeredIds.size >= limit ? 'bg-emerald-500' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min((registeredIds.size / limit) * 100, 100)}%` }}
                  />
                </div>
              )}
            </div>

            {/* 2. Weekly schedule */}
            <div>
              <h2 className="font-bold text-gray-800 mb-3">לוח שיעורים שבועי</h2>

              {!branchId ? (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
                  <p className="text-sm font-semibold text-orange-700">לא נמצא סניף משויך לחשבון שלך</p>
                  <p className="text-xs text-orange-500 mt-1">פנה למאמן לשיוך לסניף</p>
                </div>
              ) : grouped.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">אין שיעורים בסניף שלך</p>
              ) : (
                <div className="space-y-4">
                  {grouped.map(({ dow, dayName, classes: dayCls }) => (
                    <div key={dow}>
                      <p className="text-xs font-bold text-gray-400 tracking-wide mb-2 px-1">יום {dayName}</p>
                      <ul className="space-y-2">
                        {dayCls.map(cls => {
                          const isReg = registeredIds.has(cls.id)
                          const atLimit = !isReg && limit !== Infinity && registeredIds.size >= limit
                          const busy = regLoading[cls.id]
                          return (
                            <li
                              key={cls.id}
                              className={`bg-white rounded-xl border shadow-sm px-4 py-3 flex items-center justify-between gap-3 transition ${
                                isReg ? 'border-emerald-300 bg-emerald-50' : ''
                              }`}
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-800 text-sm">{cls.name}{cls.coach_name ? ` · ${cls.coach_name}` : ''}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {formatTime(cls.start_time)}
                                  {cls.end_time && ` — ${formatTime(cls.end_time)}`}
                                  {cls.hall && ` · ${cls.hall}`}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleRegistration(cls.id)}
                                disabled={busy || atLimit}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 ${
                                  isReg
                                    ? 'bg-emerald-500 text-white hover:bg-red-100 hover:text-red-700'
                                    : atLimit
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                {busy ? '...' : isReg ? '✓ רשום · בטל' : atLimit ? 'מגבלת מנוי' : 'הירשם'}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Next class */}
            <div className="bg-white rounded-xl border shadow-sm p-5">
              <h2 className="font-bold text-gray-800 mb-3">האימון הבא שלך</h2>
              {!nextClass ? (
                <div className="text-center py-6 text-gray-400">
                  <div className="text-3xl mb-2">📅</div>
                  <p className="text-sm">הירשם לשיעורים בלוח למעלה</p>
                </div>
              ) : (
                <div>
                  <p className="text-lg font-semibold text-gray-800">{nextClass.name}{nextClass.coach_name ? ` · ${nextClass.coach_name}` : ''}</p>
                  <p className="text-sm text-gray-500 mt-1">{nextClass.displayDay} · {nextClass.displayTime}</p>
                  {nextClass.end_time && (
                    <p className="text-xs text-gray-400">עד {formatTime(nextClass.end_time)}</p>
                  )}
                  {nextClass.hall && (
                    <p className="text-xs text-gray-400">{nextClass.hall}</p>
                  )}
                </div>
              )}
            </div>

            {/* 4. Announcements */}
            <div>
              <h2 className="font-bold text-gray-800 mb-3">הודעות וסמינרים</h2>
              {announcements.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">אין הודעות</p>
              ) : (
                <ul className="space-y-3">
                  {announcements.map(item => {
                    const isSeminar = item.type === 'seminar'
                    const isProduct = item.type === 'product'
                    return (
                      <li key={item.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                        {item.image_url && (
                          <img src={item.image_url} alt="" className="w-full h-44 object-cover" />
                        )}
                        <div className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              isSeminar ? 'bg-purple-100 text-purple-700'
                              : isProduct ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                            }`}>
                              {isSeminar ? '🎓 סמינר' : isProduct ? '🛒 מוצר' : '📢 הודעה'}
                            </span>
                            {item.price != null && (
                              <span className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
                                ₪{item.price}
                              </span>
                            )}
                          </div>
                          <p className="font-semibold text-gray-800">{item.title}</p>
                          {item.event_date && (
                            <div className="mt-2 flex items-center gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                              <span className="text-lg">📅</span>
                              <div>
                                <p className="text-sm font-semibold text-purple-800">
                                  {new Date(item.event_date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                <p className="text-xs text-purple-600">
                                  {new Date(item.event_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                            </div>
                          )}
                          {item.content && (
                            <p className="text-sm text-gray-500 mt-2 whitespace-pre-wrap">{item.content}</p>
                          )}
                          {(isProduct || isSeminar) && (
                            <button
                              onClick={() => isProduct && setProductModal(item)}
                              className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition ${
                                isProduct ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-purple-600 text-white hover:bg-purple-700'
                              }`}
                            >
                              {isProduct ? '🛒 לפרטים ורכישה' : '📝 לפרטים והרשמה'}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </main>

      {/* Product modal */}
      {productModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
          onClick={closeProductModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {productModal.image_url && (
              <img src={productModal.image_url} alt="" className="w-full h-52 object-cover" />
            )}
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold text-gray-800 text-lg leading-tight">{productModal.title}</h3>
                {productModal.price != null && (
                  <span className="text-lg font-bold text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full shrink-0">
                    ₪{productModal.price}
                  </span>
                )}
              </div>
              {productModal.content && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{productModal.content}</p>
              )}

              {requestSent ? (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-green-700 font-semibold">הבקשה נשלחה למאמן ✓</p>
                </div>
              ) : (
                <button
                  onClick={() => sendProductRequest(productModal)}
                  disabled={requestLoading}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition disabled:opacity-50"
                >
                  {requestLoading ? '...' : '🙋 אני מעוניין'}
                </button>
              )}

              <button
                onClick={closeProductModal}
                className="w-full py-2 border rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
