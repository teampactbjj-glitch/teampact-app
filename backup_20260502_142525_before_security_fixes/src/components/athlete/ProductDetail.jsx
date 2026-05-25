import { useState, useEffect } from 'react'

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

  const sizes = Array.isArray(product.available_sizes) ? product.available_sizes.filter(Boolean) : []
  const colors = Array.isArray(product.available_colors) ? product.available_colors.filter(Boolean) : []
  const hasSizes = sizes.length > 0
  const hasColors = colors.length > 0

  // ברירת מחדל: האפשרות המומלצת (⭐) אם יש, אחרת הראשונה
  const [selectedOption, setSelectedOption] = useState(
    hasOptions ? (options.find(o => o.is_featured) || options[0]) : null
  )
  const [selectedSize, setSelectedSize] = useState(null)    // חובה לבחור אם hasSizes
  const [selectedColor, setSelectedColor] = useState(null)  // חובה לבחור אם hasColors
  const [validationError, setValidationError] = useState('')

  // רכיבי וריאציה של האפשרות הנבחרת (למשל: תיק + חליפה → רכיב אחד; תיק + סט נו-גי → שני רכיבים)
  const optionComponents = Array.isArray(selectedOption?.components)
    ? selectedOption.components.filter(c => c && c.name)
    : []
  const hasComponents = optionComponents.length > 0
  // בחירות לכל רכיב - מערך של {size, color} באותו index של רכיב
  const [componentSelections, setComponentSelections] = useState([])

  // איפוס בחירות הרכיבים כשמשנים אפשרות רכישה
  useEffect(() => {
    if (hasComponents) {
      setComponentSelections(optionComponents.map(() => ({ size: null, color: null })))
    } else {
      setComponentSelections([])
    }
    setValidationError('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOption?.name, selectedOption?.price])

  const features = Array.isArray(product.features)
    ? product.features.filter(f => f && f.trim())
    : []

  const displayPrice = selectedOption?.price ?? product.price

  // בדיקת תקינות לפני שליחה - חובה לבחור מידה/צבע אם המוצר מצריך
  function handleOrderClick() {
    // אם כבר הוזמן - לחיצה = ביטול (לא צריך בדיקת מידה)
    if (alreadyOrdered) {
      onOrder(product, selectedOption, null, null, null)
      return
    }
    // אם יש רכיבים באפשרות - בדיקה פר-רכיב
    if (hasComponents) {
      for (let i = 0; i < optionComponents.length; i++) {
        const comp = optionComponents[i]
        const sel = componentSelections[i] || {}
        const compSizes = Array.isArray(comp.sizes) ? comp.sizes.filter(Boolean) : []
        const compColors = Array.isArray(comp.colors) ? comp.colors.filter(Boolean) : []
        if (compSizes.length && !sel.size) {
          setValidationError(`יש לבחור מידה עבור "${comp.name}"`)
          return
        }
        if (compColors.length && !sel.color) {
          setValidationError(`יש לבחור צבע עבור "${comp.name}"`)
          return
        }
      }
      setValidationError('')
      onOrder(product, selectedOption, null, null, componentSelections)
      return
    }
    // זרימה ישנה - מידה/צבע יחיד ברמת המוצר
    if (hasSizes && !selectedSize) {
      setValidationError('יש לבחור מידה')
      return
    }
    if (hasColors && !selectedColor) {
      setValidationError('יש לבחור צבע')
      return
    }
    setValidationError('')
    onOrder(product, selectedOption, selectedSize, selectedColor, null)
  }

  // פונקציית עזר לעדכון בחירה של רכיב ספציפי
  function updateComponentSelection(index, field, value) {
    setComponentSelections(prev => {
      const next = [...prev]
      next[index] = { ...(next[index] || {}), [field]: value }
      return next
    })
    setValidationError('')
  }

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

      {/* בחירת מידה/צבע ברמת המוצר - רק אם אין רכיבים באפשרות הנבחרת */}
      {!hasComponents && hasSizes && (
        <div role="group" aria-labelledby="size-heading">
          <div className="flex items-center justify-between mb-2">
            <h3 id="size-heading" className="font-bold text-sm text-gray-800">📏 בחר מידה</h3>
            {selectedSize && (
              <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedSize}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map(size => {
              const isSelected = selectedSize === size
              return (
                <button
                  key={size}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`מידה ${size}`}
                  onClick={() => { setSelectedSize(size); setValidationError('') }}
                  className={`min-w-[52px] py-2 px-3 rounded-xl border-2 text-sm font-bold transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {size}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!hasComponents && hasColors && (
        <div role="group" aria-labelledby="color-heading">
          <div className="flex items-center justify-between mb-2">
            <h3 id="color-heading" className="font-bold text-sm text-gray-800">🎨 בחר צבע</h3>
            {selectedColor && (
              <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedColor}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {colors.map(color => {
              const isSelected = selectedColor === color
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`צבע ${color}`}
                  onClick={() => { setSelectedColor(color); setValidationError('') }}
                  className={`py-2 px-4 rounded-xl border-2 text-sm font-bold transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {color}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* בחירת מידה/צבע פר-רכיב - כשהאפשרות הנבחרת מכילה רכיבים */}
      {hasComponents && (
        <div className="space-y-4">
          {optionComponents.map((comp, idx) => {
            const compSizes = Array.isArray(comp.sizes) ? comp.sizes.filter(Boolean) : []
            const compColors = Array.isArray(comp.colors) ? comp.colors.filter(Boolean) : []
            const sel = componentSelections[idx] || {}
            return (
              <div key={idx} className="bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-200 rounded-xl p-3 space-y-3">
                <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{idx + 1}</span>
                  {comp.name}
                </h3>
                {/* מידה לרכיב */}
                {compSizes.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-700">📏 מידה</span>
                      {sel.size && <span className="text-xs text-emerald-600 font-bold">{sel.size}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {compSizes.map(size => {
                        const isSelected = sel.size === size
                        return (
                          <button
                            key={size}
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`${comp.name} מידה ${size}`}
                            onClick={() => updateComponentSelection(idx, 'size', size)}
                            className={`min-w-[44px] py-1.5 px-2.5 rounded-lg border-2 text-xs font-bold transition ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {size}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {/* צבע לרכיב */}
                {compColors.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-700">🎨 צבע</span>
                      {sel.color && <span className="text-xs text-emerald-600 font-bold">{sel.color}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {compColors.map(color => {
                        const isSelected = sel.color === color
                        return (
                          <button
                            key={color}
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`${comp.name} צבע ${color}`}
                            onClick={() => updateComponentSelection(idx, 'color', color)}
                            className={`py-1.5 px-3 rounded-lg border-2 text-xs font-bold transition ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {color}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* אפשרויות רכישה */}
      {hasOptions && (
        <div role="group" aria-labelledby="purchase-option-heading">
          <h3 id="purchase-option-heading" className="font-bold text-sm text-gray-800 mb-2">💰 בחר אפשרות רכישה</h3>
          <div className="space-y-2">
            {options.map((opt, i) => {
              const selected = selectedOption && (
                selectedOption.name === opt.name && selectedOption.price === opt.price
              )
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={selected}
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
        {/* סיכום בחירות */}
        {!alreadyOrdered && (hasSizes || hasColors || hasOptions || hasComponents) && (
          <div className="mb-3 p-2.5 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-0.5">
            {hasOptions && selectedOption && (
              <div>📦 אפשרות: <span className="font-bold text-gray-800">{selectedOption.name}</span></div>
            )}
            {/* סיכום לוריאציה פשוטה */}
            {!hasComponents && hasSizes && (
              <div>📏 מידה: <span className="font-bold text-gray-800">{selectedSize || '— לא נבחר'}</span></div>
            )}
            {!hasComponents && hasColors && (
              <div>🎨 צבע: <span className="font-bold text-gray-800">{selectedColor || '— לא נבחר'}</span></div>
            )}
            {/* סיכום פר-רכיב */}
            {hasComponents && optionComponents.map((comp, i) => {
              const sel = componentSelections[i] || {}
              const parts = []
              if (Array.isArray(comp.sizes) && comp.sizes.length) parts.push(`מידה: ${sel.size || '— לא נבחר'}`)
              if (Array.isArray(comp.colors) && comp.colors.length) parts.push(`צבע: ${sel.color || '— לא נבחר'}`)
              return (
                <div key={i}>
                  <span className="font-bold text-gray-800">{comp.name}:</span> {parts.join(' · ')}
                </div>
              )
            })}
          </div>
        )}

        {/* הודעת שגיאה */}
        {validationError && !alreadyOrdered && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-center font-bold">
            ⚠️ {validationError}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm text-gray-600">סה"כ לתשלום</div>
          {displayPrice != null && (
            <div className="text-2xl font-bold text-emerald-600">₪{displayPrice}</div>
          )}
        </div>
        <button
          onClick={handleOrderClick}
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
