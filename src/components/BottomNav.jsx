export default function BottomNav({ activeTab, onTabChange, isTrainer, pendingCount = 0, leadsCount = 0, ordersCount = 0 }) {
  const tabs = isTrainer
    ? [
        { id: 'schedule',      icon: '📅', label: 'לו״ז' },
        { id: 'athletes',      icon: '👥', label: 'מתאמנים' },
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
    <nav dir="rtl" className="flex"
      style={{ position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 9999, paddingBottom: 'env(safe-area-inset-bottom)', minHeight: '54px', background: '#ffffff', borderTop: '2px solid #d1d5db', boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.12)' }}>
      {tabs.map(tab => {
        const active = activeTab === tab.id
        return (
          <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 border-none cursor-pointer transition-all duration-150"
            style={{ color: active ? '#047857' : '#6b7280', background: active ? 'rgba(5, 150, 105, 0.10)' : 'transparent' }}>
            {active && (
              <span style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: 3, background: '#059669', borderRadius: '0 0 3px 3px' }} />
            )}
            <span className="leading-none" style={{ fontSize: active ? '1.35rem' : '1.15rem', transition: 'font-size 150ms' }}>{tab.icon}</span>
            <span className="text-[10px] leading-none" style={{ fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            {tab.id === 'shop' && isTrainer && ordersCount > 0 && (
              <span className="absolute top-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold"
                style={{ right: '22%', width: 16, height: 16 }}>{ordersCount}</span>
            )}
            {tab.id === 'athletes' && isTrainer && (leadsCount + pendingCount) > 0 && (
              <span className="absolute top-1.5 flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold"
                style={{ right: '22%', width: 16, height: 16 }}>{leadsCount + pendingCount}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
