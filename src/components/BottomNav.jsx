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
    <nav dir="rtl" className="flex" aria-label="ניווט ראשי"
      style={{
        position: 'fixed',
        // inset במקום bottom בלבד — מנעול חזק יותר לכל הצדדים, מקטין סיכוי ל"עליה" ב-iOS
        inset: 'auto 0 0 0',
        width: '100%',
        zIndex: 9999,
        paddingBottom: 'env(safe-area-inset-bottom)',
        minHeight: '68px',
        background: '#ffffff',
        borderTop: '2px solid #d1d5db',
        boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.12)',
        // האצת חומרה — מעבירה את ה-nav לשכבת קומפוזיציה נפרדת,
        // ככה היא לא "מטיילת" עם momentum scroll ב-iOS PWA
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        willChange: 'transform',
        // מבטיח שגם ב-iOS PWA הסרגל מקובע ל-viewport ולא לקונטיינר
        WebkitBackfaceVisibility: 'hidden',
        backfaceVisibility: 'hidden',
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
            className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 border-none cursor-pointer transition-all duration-150 focus:outline focus:outline-2 focus:outline-offset-[-2px] focus:outline-emerald-600"
            style={{ color: active ? '#047857' : '#4b5563', background: active ? 'rgba(5, 150, 105, 0.10)' : 'transparent' }}>
            {active && (
              <span aria-hidden="true" style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: 3, background: '#059669', borderRadius: '0 0 3px 3px' }} />
            )}
            <span aria-hidden="true" className="leading-none" style={{ fontSize: active ? '1.5rem' : '1.3rem', transition: 'font-size 150ms' }}>{tab.icon}</span>
            <span className="text-[11px] leading-none" style={{ fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            {badgeCount > 0 && (
              <span aria-hidden="true" className={`absolute top-1.5 flex items-center justify-center rounded-full ${badgeColor === 'red' ? 'bg-red-600' : 'bg-orange-500'} text-white text-[10px] font-bold`}
                style={{ right: '22%', width: 16, height: 16 }}>{badgeCount}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
