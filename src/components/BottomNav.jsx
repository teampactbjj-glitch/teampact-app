export default function BottomNav({ activeTab, onTabChange, isTrainer, pendingCount = 0, leadsCount = 0 }) {
  const tabs = isTrainer
    ? [
        { id: 'schedule', icon: '📅', label: 'לו״ח' },
        { id: 'shop',     icon: '🛒', label: 'חנות' },
        { id: 'athletes', icon: '👥', label: 'מתאמנים' },
        { id: 'leads',    icon: '🙋', label: 'לידים' },
        { id: 'profile',  icon: '👤', label: 'פרופיל' },
      ]
    : [
        { id: 'home',     icon: '🏠', label: 'בית' },
        { id: 'schedule', icon: '📅', label: 'לו״ח' },
        { id: 'shop',     icon: '🛒', label: 'חנות' },
        { id: 'profile',  icon: '👤', label: 'פרופיל' },
      ]
  return (
    <nav dir="rtl" className="bg-white border-t border-gray-200 shadow-lg flex" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, width: '100%', zIndex: 9999, paddingBottom: 'env(safe-area-inset-bottom)', minHeight: '60px' }}>
      {tabs.map(tab => {
        const active = activeTab === tab.id
        return (
          <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)} className="relative flex flex-1 flex-col items-center justify-center gap-1 py-3 bg-transparent border-none cursor-pointer transition-colors duration-150" style={{ color: active ? '#1d4ed8' : '#9ca3af' }}>
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className="text-[10px] leading-none" style={{ fontWeight: active ? 700 : 500 }}>{tab.label}</span>
            {tab.id === 'shop' && isTrainer && pendingCount > 0 && (
              <span className="absolute top-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold" style={{ right: '22%', width: 16, height: 16 }}>{pendingCount}</span>
            )}
            {tab.id === 'leads' && leadsCount > 0 && (
              <span className="absolute top-1.5 flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold" style={{ right: '22%', width: 16, height: 16 }}>{leadsCount}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
