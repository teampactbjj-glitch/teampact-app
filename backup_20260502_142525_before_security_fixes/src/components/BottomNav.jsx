export default function BottomNav({ activeTab, onTabChange, isTrainer, isAdmin = false, pendingCount = 0, leadsCount = 0, ordersCount = 0, announcementsCount = 0, scheduleCount = 0, coachesCount = 0 }) {
  const tabs = isTrainer
    ? [
        { id: 'schedule',      icon: '📅', label: 'לו״ז' },
        { id: 'athletes',      icon: '👥', label: 'מתאמנים' },
        ...(isAdmin ? [{ id: 'reports', icon: '📊', label: 'דוחות' }] : []),
        ...(isAdmin ? [{ id: 'coaches', icon: '🥋', label: 'מאמנים' }] : []),
        { id: 'shop',          icon: '🛒', label: 'חנות' },
        { id: 'announcements', icon: '📢', label: 'הודעות' },
        { id: 'profile',       icon: '👤', label: 'פרופיל' },
      ]
    : [
        { id: 'schedule',      icon: '📅', label: 'לו״ז' },
        { id: 'shop',          icon: '🛒', label: 'חנות' },
        { id: 'announcements', icon: '📢', label: 'הודעות' },
        { id: 'profile',       icon: '👤', label: 'פרופיל' },
      ]
  return (
    <nav dir="rtl" className="flex shrink-0" aria-label="ניווט ראשי"
      style={{
        // ללא position:fixed — flex item רגיל בתוך wrapper של flex column עם 100dvh.
        width: '100%',
        zIndex: 9999,
        // גובה אחיד מקצועי: 64px בסיס + safe-area-inset-bottom (לאינדיקטור הבית של iPhone).
        // זה תואם לסטנדרט iOS Tab Bar (49-83pt) ו-Material Design (56-80dp).
        height: 'calc(64px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.06)',
      }}>
      {tabs.map(tab => {
        const active = activeTab === tab.id

        // חישוב מספר ההתראות לטאב הזה (לבניית aria-label תיאורי)
        let badgeCount = 0
        let badgeColor = null
        if (tab.id === 'schedule' && isTrainer && scheduleCount > 0) { badgeCount = scheduleCount; badgeColor = 'red' }
        else if (tab.id === 'shop' && isTrainer && ordersCount > 0) { badgeCount = ordersCount; badgeColor = 'red' }
        else if (tab.id === 'athletes' && isTrainer && (leadsCount + pendingCount) > 0) { badgeCount = leadsCount + pendingCount; badgeColor = 'orange' }
        else if (tab.id === 'announcements' && announcementsCount > 0) { badgeCount = announcementsCount; badgeColor = 'red' }
        else if (tab.id === 'coaches' && isAdmin && coachesCount > 0) { badgeCount = coachesCount; badgeColor = 'orange' }

        const badgeLabel = badgeCount > 0 ? `, ${badgeCount} התראות חדשות` : ''
        const ariaLabel = `${tab.label}${badgeLabel}`

        return (
          <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)}
            aria-label={ariaLabel}
            aria-current={active ? 'page' : undefined}
            className="relative flex flex-1 flex-col items-center justify-center gap-1 border-none cursor-pointer transition-colors duration-150 focus:outline focus:outline-2 focus:outline-offset-[-2px] focus:outline-emerald-600"
            style={{
              // המרווח הפנימי מבטיח שהאייקון והתווית מרוכזים יפה בכל גובה הכפתור.
              padding: '8px 4px',
              color: active ? '#047857' : '#6b7280',
              background: 'transparent',
            }}>
            {/* אינדיקטור פעיל — קו בעל רוחב חצי כפתור בראש, צבע אמרלד */}
            {active && (
              <span aria-hidden="true" style={{
                position: 'absolute',
                top: 0,
                left: '25%',
                right: '25%',
                height: 3,
                background: '#059669',
                borderRadius: '0 0 4px 4px',
              }} />
            )}
            <span aria-hidden="true" className="leading-none" style={{
              fontSize: '22px',           // גודל קבוע — לא משתנה בין active ל-inactive (יותר נקי)
              lineHeight: 1,
            }}>{tab.icon}</span>
            <span className="leading-none" style={{
              fontSize: '11px',
              fontWeight: active ? 700 : 500,
              letterSpacing: '0.01em',
            }}>{tab.label}</span>
            {badgeCount > 0 && (
              <span aria-hidden="true" className={`absolute flex items-center justify-center rounded-full ${badgeColor === 'red' ? 'bg-red-600' : 'bg-orange-500'} text-white text-[10px] font-bold`}
                style={{
                  top: 6,
                  right: '50%',
                  transform: 'translateX(14px)',
                  width: 16,
                  height: 16,
                  border: '2px solid #ffffff',
                }}>{badgeCount}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
