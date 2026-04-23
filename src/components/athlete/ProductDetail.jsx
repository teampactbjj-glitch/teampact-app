import { useState } from 'react'

/**
 * דף פירוט מוצר למתאמן - נפתח כמסך מלא כשלוחצים על מוצר בחנות.
 * מציג: תמונה, תיאור קצר, תיאור מלא, תכונות בולטות, ואפשרויות רכישה.
 *
 * Props:
 *   product        - רשומת המוצר (announcements)
 *   onBack         - פונקציה לחזרה לרשימת החנות
 *   onOrder        - (product, selectedOption) => Promise - לחיצה על "הזמן"
 *   alreadyOrdered - בולאני: האם המוצר כבר הוזמן
 *   ordering       - בולאני: האם כרגע בתהליך הזמנה (לבטל כפתור)
 */
export default function ProductDetail({ product, onBack, onOrder, alreadyOrdered, ordering }) {
  const options = Array.isArray(product.purchase_options)
    ? product.purchase_options.filter(o => o && (o.name || o.price != null))
    : []
  const hasOptions = options.length > 0

  // ברירת מחדל: האפשרות המומלצת (⭐) אם יש, אחרת הראשונה
  const [selectedOption, setSelectedOption] = useState(
    hasOptions ? (options.find(o => o.is_featured) || options[0]) : null
  )

  const features = Array.isArray(product.features)
    ? product.features.filter(f => f && f.trim())
    : []

  const displayPrice = selectedOption?.price ?? product.price

  return (
    <div className="space-y-4 pb-6">
      {/* כותרת עם חץ חזרה */}
      <div className="sticky top-0 bg-white z-20 -mx-4 px-4 py-3 border-b flex items-center gap-2 shadow-sm">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-lg"
          aria-label="חזרה"
        >
          →
        </button>
        <span className="font-bold text-gray-800 truncate flex-1">{product.title}</span>
      </div>

      {/* תמונה */}
      {product.image_url && (
        <div className="bg-gray-50 rounded-xl overflow-hidden">
          <img
            src={product.image_url}
            alt={product.title}
            className="w-full h-auto max-h-[400px] object-contain"
          />
        </div>
      )}

      {/* כותרת + תיאור קצר */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{product.title}</h2>
        {product.content && (
          <p className="text-sm text-gray-600 mt-1.5 leading-relaxed">{product.content}</p>
        )}
        {!hasOptions && product.price != null && (
          <div className="mt-2">
            <span className="text-2xl font-bold text-emerald-600">₪{product.price}</span>
          </div>
        )}
        {hasOptions && (
          <div className="mt-2 text-sm text-gray-500">
            החל מ־<span className="text-emerald-600 font-bold">
              ₪{Math.min(...options.filter(o => o.price != null).map(o => o.price))}
            </span>
          </div>
        )}
      </div>

      {/* תיאור מלא */}
      {product.description_long && (
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {product.description_long}
          </p>
        </div>
      )}

      {/* תכונות בולטות */}
      {features.length > 0 && (
        <div>
          <h3 className="font-bold text-sm text-gray-800 mb-2">✨ תכונות בולטות</h3>
          <ul className="space-y-1.5 bg-white rounded-xl border p-3">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-emerald-600 mt-0.5 flex-shrink-0">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* אפשרויות רכישה */}
      {hasOptions && (
        <div>
          <h3 className="font-bold text-sm text-gray-800 mb-2">💰 בחר אפשרות רכישה</h3>
          <div className="space-y-2">
            {options.map((opt, i) => {
              const selected = selectedOption && (
                selectedOption.name === opt.name && selectedOption.price === opt.price
              )
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedOption(opt)}
                  className={`w-full text-right p-3 rounded-xl border-2 transition ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-sm flex-shrink-0 ${
                            selected ? 'text-emerald-600' : 'text-gray-300'
                          }`}
                        >
                          {selected ? '●' : '○'}
                        </span>
                        <span className="font-bold text-gray-800">{opt.name}</span>
                        {opt.is_featured && (
                          <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            ⭐ מומלץ
                          </span>
                        )}
                      </div>
                      {opt.note && (
                        <p className="text-xs text-gray-500 mt-1 pr-6">{opt.note}</p>
                      )}
                    </div>
                    {opt.price != null && (
                      <span className="text-lg font-bold text-emerald-600 flex-shrink-0">
                        ₪{opt.price}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* סרגל הזמנה */}
      <div className="pt-2 border-t">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm text-gray-600">סה"כ לתשלום</div>
          {displayPrice != null && (
            <div className="text-2xl font-bold text-emerald-600">₪{displayPrice}</div>
          )}
        </div>
        <button
          onClick={() => onOrder(product, selectedOption)}
          disabled={ordering}
          className={`w-full py-3 rounded-xl text-sm font-bold transition disabled:opacity-50 ${
            alreadyOrdered
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {ordering
            ? '...'
            : alreadyOrdered
            ? '✓ הוזמן — יתקבל באימון (לחץ לביטול)'
            : hasOptions && selectedOption
            ? `הזמן "${selectedOption.name}" ב־₪${selectedOption.price}`
            : 'הזמן עכשיו'}
        </button>
        <p className="text-[11px] text-gray-400 text-center mt-2">
          ההזמנה תישלח למאמן · התשלום יתבצע באימון הקרוב
        </p>
      </div>
    </div>
  )
}
