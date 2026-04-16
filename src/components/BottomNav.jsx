export default function BottomNav({ activeTab, onTabChange, isTrainer, pendingCount = 0 }) {
  const tabs = [
    { id: 'schedule', icon: '📅', label: 'לוח אימונים' },
    { id: 'shop', icon: '🛒', label: 'חנות' },
    { id: 'profile', icon: '👤', label: 'פרופיל' },
    ...(isTrainer ? [{ id: 'athletes', icon: '👥', label: 'ניהול מתאמנים' }] : []),
  ]

  return (
    <nav
      dir="rtl"
      className="fixed bottom-0 left-0 right-0 w-full z-50 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(tab => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2 border-none bg-transparent cursor-pointer transition-colors duration-150 ${
              active ? 'text-blue-700' : 'text-gray-400'
            }`}
          >
            <span className="text-xl leading-none">{tab.icon}</span>
            <span className={`text-[10px] leading-none ${active ? 'font-bold' : 'font-medium'}`}>
              {tab.label}
            </span>
            {tab.id === 'shop' && isTrainer && pendingCount > 0 && (
              <span className="absolute top-1.5 right-[22%] w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
