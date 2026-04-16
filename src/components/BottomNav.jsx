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
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '64px',
        background: 'white',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        zIndex: 100,
        boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            color: activeTab === tab.id ? '#1d4ed8' : '#9ca3af',
            transition: 'color 0.15s',
          }}
        >
          <span style={{ fontSize: '20px', lineHeight: 1 }}>{tab.icon}</span>
          <span style={{ fontSize: '10px', fontWeight: activeTab === tab.id ? '700' : '500', lineHeight: 1 }}>
            {tab.label}
          </span>
          {tab.id === 'shop' && isTrainer && pendingCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '6px',
              right: '22%',
              background: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              width: '16px',
              height: '16px',
              fontSize: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            }}>
              {pendingCount}
            </span>
          )}
        </button>
      ))}
    </nav>
  )
}
