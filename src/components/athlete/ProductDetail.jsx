import { useState, useEffect, useRef } from 'react'
import { ADULT_BELTS, KIDS_BELTS } from '../../lib/belts'

// נרמול שם לצורך השוואה: רווחים, מקפים, גרשיים, זכר/נקבה
// למשל: "אפור שחור" == "אפור-שחור" == "אפור - שחור"
//        "לבן" == "לבנה"  |  "שחור" == "שחורה"
export function normalizeColorName(s) {
  if (!s) return ''
  return s
    .trim()
    .replace(/['''׳]/g, "'")         // גרשיים
    .replace(/\s*-\s*/g, ' ')        // מקף עם/בלי רווחים → רווח
    .replace(/ה$/g, '')              // הסרת ה' בסוף (לבנה→לבן, שחורה→שחור)
    .toLowerCase()
}

// סדר תצוגת חגורות: בוגרים (לבנה→שחורה) ואז ילדים (אפור→ירוק שחור).
// מנורמל כדי להתאים גם לכתיב זכר/נקבה ומקפים בנתוני המלאי.
const BELT_COLOR_ORDER = [
  'לבנה', 'כחולה', 'סגולה', 'חומה', 'שחורה',
  'לבן אפור', 'אפור', 'אפור שחור',
  'צהוב לבן', 'צהוב', 'צהוב שחור',
  'כתום לבן', 'כתום', 'כתום שחור',
  'ירוק לבן', 'ירוק', 'ירוק שחור',
].map(normalizeColorName)

function beltColorIndex(c) {
  const i = BELT_COLOR_ORDER.indexOf(normalizeColorName(c))
  return i === -1 ? 999 : i
}

// סדר מידות: XXXS→XXXL, A0→A4, ואז מידות ס"מ (ילדים) לפי מספר.
const SIZE_ORDER = ['XXXS','XXS','XS','S','M','L','XL','XXL','XXXL','A0','A1','A2','A3','A4']
function sizeIndex(s) {
  const str = (s || '').trim()
  const i = SIZE_ORDER.indexOf(str)
  if (i !== -1) return i
  const cm = str.match(/(\d+)/)        // "100ס\"מ" וכד'
  if (cm) return 100 + parseInt(cm[1], 10)
  return 999
}
function sortSizes(arr) {
  return [...arr].sort((a, b) => sizeIndex(a) - sizeIndex(b))
}

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
export default function ProductDetail({ product, variants = [], compVariantsMap = {}, relatedBundles = [], allProducts = [], onBack, onOrder, onEdit, alreadyOrdered, ordering, editMode = false, initialSize = null, initialColor = null, initialLength = null, initialNotes = null, initialQuantity = 1 }) {
  const isBundle = product.type === 'bundle'
  const bundleItems = isBundle ? (product.bundle_items || []) : []
  // variants = מערך וריאנטים מה-DB עם stock. אם ריק = אין מידע מלאי, מציגים הכל
  const hasVariantData = variants.length > 0

  // ── זיהוי מוצר חגורה ומיון לשתי שורות ──
  const isBeltProduct = (product.title || '').includes('חגורה')
  const adultBeltLabels = new Set(ADULT_BELTS.map(b => b.label))
  const kidsBeltLabels  = new Set(KIDS_BELTS.map(b => b.label))
  const allBeltsMap = Object.fromEntries(
    [...ADULT_BELTS, ...KIDS_BELTS].map(b => [b.label, b])
  )
  // פונקציה לרינדור כפתור חגורה עם צבע אמיתי
  function BeltButton({ color, isSelected, inStock, onToggle }) {
    const beltMeta = allBeltsMap[color]
    return (
      <button type="button" aria-pressed={isSelected} disabled={!inStock}
        onClick={() => onToggle(isSelected ? null : color)}
        style={beltMeta ? { backgroundColor: beltMeta.color, color: beltMeta.text, borderColor: isSelected ? '#10b981' : inStock ? beltMeta.color : '#e5e7eb' } : {}}
        className={`py-1.5 px-3 rounded-lg border-2 text-xs font-bold transition ${
          !inStock ? 'opacity-50 cursor-not-allowed'
          : isSelected ? 'ring-2 ring-emerald-500 ring-offset-1 shadow-md scale-105'
          : 'hover:scale-105'
        }`}>
        {color}
        {!inStock && <span className="block text-[8px] font-normal">אזל</span>}
      </button>
    )
  }
  // קטע תצוגת חגורות מחולק לשתי שורות
  function BeltColorSection({ headingId, onToggle }) {
    const adultColors = colors.filter(c => adultBeltLabels.has(c))
    const kidsColors  = colors.filter(c => kidsBeltLabels.has(c))
    return (
      <div role="group" aria-labelledby={headingId}>
        <div className="flex items-center justify-between mb-2">
          <h3 id={headingId} className="font-bold text-sm text-gray-800">🥋 בחר דרגה</h3>
          {selectedColor && <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedColor}</span>}
        </div>
        {adultColors.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">בוגרים</p>
            <div className="flex flex-wrap gap-2">
              {adultColors.map(color => (
                <BeltButton key={color} color={color} isSelected={selectedColor === color}
                  inStock={colorHasStock(color)} onToggle={onToggle} />
              ))}
            </div>
          </div>
        )}
        {kidsColors.length > 0 && (
          <div>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mb-1">ילדים</p>
            <div className="flex flex-wrap gap-2">
              {kidsColors.map(color => (
                <BeltButton key={color} color={color} isSelected={selectedColor === color}
                  inStock={colorHasStock(color)} onToggle={onToggle} />
              ))}
            </div>
          </div>
        )}
        {adultColors.length === 0 && kidsColors.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {colors.map(color => (
              <BeltButton key={color} color={color} isSelected={selectedColor === color}
                inStock={colorHasStock(color)} onToggle={onToggle} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // מחפש מוצר לפי שם רכיב — התאמה מדויקת לשם מוצר בודד
  function getCompProductData(compName) {
    if (!compName || !allProducts.length) return { sizes: [], colors: [], lengths: [] }
    const normalize = s => (s || '').replace(/['''׳]/g, "'").trim()
    const normComp = normalize(compName)
    const match = allProducts.find(p => normalize(p.title) === normComp)
    if (!match) return { sizes: [], colors: [], lengths: [] }
    return {
      sizes: Array.isArray(match.available_sizes) ? match.available_sizes.filter(Boolean) : [],
      colors: Array.isArray(match.available_colors) ? match.available_colors.filter(Boolean) : [],
      lengths: Array.isArray(match.available_lengths) ? match.available_lengths.filter(Boolean) : [],
    }
  }

  // פונקציות עזר לבדיקת מלאי — מודעות לפריט (component_name)
  // אם אין וריאנטים לאותו פריט → מציגים הכל כזמין (אין נתון מלאי)

  function getCompVars(compName) {
    if (compName === null) {
      // מחזיר את כל הוריאנטים של המוצר לבדיקת מלאי —
      // מלאי יכול לשבת תחת component_name שונה (למשל 'חליפה') ולא בהכרח null
      return variants.length > 0 ? variants : []
    }
    // חיפוש קודם ב-compVariantsMap (וריאנטים של מוצר רכיב נפרד בחבילה)
    if (compVariantsMap[compName]?.length) return compVariantsMap[compName]
    return variants.filter(v => (v.component_name || null) === compName)
  }

  // השוואת צבע עם נרמול (רווח/מקף, זכר/נקבה)
  const colorsMatch = (a, b) => normalizeColorName(a) === normalizeColorName(b)

  // בדיקת זמינות צבע (ללא סינון מידה — צבע הוא הבחירה הראשונה)
  const colorHasStock = (color, compName = null) => {
    const cv = getCompVars(compName)
    if (cv.length === 0) return true
    return cv.some(v => colorsMatch(v.color, color) && (v.stock || 0) > 0)
  }

  // בדיקת זמינות אורך — מסונן לפי צבע שנבחר
  const lengthHasStock = (len, forColor = null, compName = null) => {
    const cv = getCompVars(compName)
    if (cv.length === 0) return true
    return cv.some(v =>
      v.length === len &&
      (!forColor || colorsMatch(v.color, forColor)) &&
      (v.stock || 0) > 0
    )
  }

  // בדיקת זמינות מידה — מסוננת לפי צבע + אורך שנבחרו
  const sizeHasStock = (size, forColor = null, forLength = null, compName = null) => {
    const cv = getCompVars(compName)
    if (cv.length === 0) return true
    return cv.some(v =>
      v.size === size &&
      (!forColor || colorsMatch(v.color, forColor)) &&
      (!forLength || v.length === forLength) &&
      (v.stock || 0) > 0
    )
  }
  const options = Array.isArray(product.purchase_options)
    ? product.purchase_options.filter(o => o && (o.name || o.price != null))
    : []
  const hasOptions = options.length > 0

  // מידות/צבעים/אורכים — available_* לתצוגה (מה המנהל הגדיר במוצר),
  // product_variants לבדיקת מלאי בלבד (אילו מהם אזלו).
  // fallback ל-variants אם available_* ריק (מוצר ישן ללא הגדרה ידנית)
  const variantSizes   = [...new Set(variants.map(v => v.size).filter(Boolean))]
  const variantColors  = [...new Set(variants.map(v => v.color).filter(Boolean))]
  const variantLengths = [...new Set(variants.map(v => v.length).filter(Boolean))]
  const sizes   = Array.isArray(product.available_sizes)   && product.available_sizes.filter(Boolean).length   > 0
    ? product.available_sizes.filter(Boolean)   : variantSizes
  const colors  = Array.isArray(product.available_colors)  && product.available_colors.filter(Boolean).length  > 0
    ? product.available_colors.filter(Boolean)  : variantColors
  const lengths = Array.isArray(product.available_lengths) && product.available_lengths.filter(Boolean).length > 0
    ? product.available_lengths.filter(Boolean) : variantLengths
  const hasSizes = sizes.length > 0
  const hasColors = colors.length > 0
  const hasLengths = lengths.length > 0
  // כשהטעמים/אפשרויות הם בדיוק המידות (למשל אמינו עם blueberry/mango כ-size וגם כ-option)
  // → לא מציגים size picker נפרד, ומשתמשים ב-selectedOption לחישוב מלאי
  const sizesAreOptions = hasOptions && hasSizes && options.every(o =>
    sizes.some(s => s.toLowerCase().trim() === (o.name || '').toLowerCase().trim())
  )

  // ברירת מחדל: אם מצב עריכה — שחזר אפשרות מה-notes, אחרת האפשרות המומלצת
  const cheapestOption = hasOptions ? [...options].sort((a,b)=>(a.price||0)-(b.price||0))[0] : null
  const initialOption = (() => {
    if (!editMode || !initialNotes || !hasOptions) return cheapestOption
    const match = initialNotes.match(/אפשרות: ([^·]+)/)
    if (match) {
      const name = match[1].trim()
      return options.find(o => o.name === name) || cheapestOption
    }
    return cheapestOption
  })()
  const [selectedOption, setSelectedOption] = useState(initialOption)
  const [selectedSize, setSelectedSize] = useState(initialSize)
  const [selectedColor, setSelectedColor] = useState(initialColor)
  const [selectedLength, setSelectedLength] = useState(initialLength)
  const [quantity, setQuantity] = useState(initialQuantity)
  const [validationError, setValidationError] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [addBelt, setAddBelt] = useState(false)
  const skipResetRef = useRef(false)

  // בחירות לכל פריט בחבילה: { [product_id]: { size, color, length } }
  const [bundleSelections, setBundleSelections] = useState(() =>
    Object.fromEntries(bundleItems.map(i => [i.product_id, { size: null, color: null, length: null }]))
  )
  function updateBundleSel(productId, field, value) {
    setBundleSelections(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }))
    setValidationError('')
  }

  // רכיבי וריאציה של האפשרות הנבחרת (למשל: תיק + חליפה → רכיב אחד; תיק + סט נו-גי → שני רכיבים)
  const optionComponents = Array.isArray(selectedOption?.components)
    ? selectedOption.components.filter(c => c && c.name)
    : []
  const hasComponents = optionComponents.length > 0
  // בחירות לכל רכיב - מערך של {size, color} באותו index של רכיב
  const [componentSelections, setComponentSelections] = useState([])

  // איפוס בחירות הרכיבים כשמשנים אפשרות רכישה
  useEffect(() => {
    if (skipResetRef.current) { skipResetRef.current = false; return }
    if (hasComponents) {
      setComponentSelections(optionComponents.map(() => ({ size: null, color: null, length: null })))
    } else {
      setComponentSelections([])
    }
    setValidationError('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOption?.name, selectedOption?.price])

  const features = Array.isArray(product.features)
    ? product.features.filter(f => f && f.trim())
    : []

  // אופציות מסודרות לפי מחיר — לזיהוי בסיס + תוספת
  const sortedOpts = hasOptions ? [...options].sort((a,b) => (a.price||0)-(b.price||0)) : []
  const baseOpt   = sortedOpts[0] || null
  const addOnOpt  = sortedOpts[1] || null  // תוספת (למשל חגורה)
  const addOnDiff = (addOnOpt?.price != null && baseOpt?.price != null) ? addOnOpt.price - baseOpt.price : null

  function toggleBelt() {
    const giSel = componentSelections[0] || { size: null, color: null, length: null }
    skipResetRef.current = true
    if (!addBelt && addOnOpt) {
      setSelectedOption(addOnOpt)
      setComponentSelections([giSel, { size: null, color: null, length: null }])
    } else if (addBelt && baseOpt) {
      setSelectedOption(baseOpt)
      setComponentSelections([giSel])
    }
    setAddBelt(v => !v)
  }

  // האם המשתמש בחר צבע ומידה לרכיב הראשון (חליפה) — להציג אופציית הוספת חגורה
  const giColorDone = !!(selectedColor || componentSelections[0]?.color)
  const giSizeDone  = !!componentSelections[0]?.size
  const canShowBeltAddon = hasOptions && addOnOpt && (giColorDone && giSizeDone)

  const displayPrice = selectedOption?.price ?? product.price
  const displayTotal = displayPrice != null ? displayPrice * quantity : null

  // חישוב מלאי לוריאנט הנבחר (לבדיקת כמות מקסימלית)
  function getSelectedVariantStock() {
    if (!hasVariantData) return Infinity
    const cv = getCompVars(null)
    if (cv.length === 0) return Infinity

    // כשהטעמים/אפשרויות הם המידות — השתמש ב-selectedOption לחיפוש וריאנט
    if (sizesAreOptions && selectedOption?.name) {
      const optName = selectedOption.name.toLowerCase().trim()
      const matched = cv.filter(v =>
        (v.size  && v.size.toLowerCase().trim()  === optName) ||
        (v.color && v.color.toLowerCase().trim() === optName)
      )
      if (matched.length > 0) return matched.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
    }

    if (!hasSizes && !hasColors && !hasLengths) {
      // מוצר ללא בחירות מידה/צבע/אורך — אם יש אפשרות נבחרת (למשל: blueberry/mango)
      // נסה להתאים לפי שם האפשרות לשדה color או size של הוריאנט
      if (selectedOption?.name) {
        const optName = selectedOption.name.toLowerCase().trim()
        const matched = cv.filter(v =>
          (v.color && v.color.toLowerCase().trim() === optName) ||
          (v.size  && v.size.toLowerCase().trim()  === optName)
        )
        if (matched.length > 0) {
          return matched.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
        }
      }
      // אין התאמה לאפשרות — סכום כל הוריאנטים (מוצר פשוט ללא אפשרויות)
      return cv.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
    }

    // מוצר עם בחירות מידה/צבע/אורך — מצא את הוריאנט המדויק
    const match = cv.find(v =>
      (!selectedSize   || v.size   === selectedSize) &&
      (!selectedColor  || v.color  === selectedColor) &&
      (!selectedLength || v.length === selectedLength)
    )
    return match ? (parseInt(match.stock) || 0) : 0
  }
  // חישוב תמיד — גם למוצר פשוט ללא מידות/צבעים (וריאנט יחיד)
  const variantStock = !hasComponents ? getSelectedVariantStock() : Infinity
  const maxQty = variantStock === Infinity ? 99 : variantStock
  const outOfStock = hasVariantData && maxQty === 0 && !alreadyOrdered && !editMode

  // בדיקת תקינות לפני שליחה - חובה לבחור מידה/צבע אם המוצר מצריך
  function handleOrderClick() {
    if (alreadyOrdered) {
      onOrder(product, selectedOption, null, null, null, null, quantity)
      return
    }
    // חבילה: ולידציה לפי כל פריט
    if (isBundle) {
      for (const item of bundleItems) {
        const itemVars = compVariantsMap[item.product_id] || []
        const sel = bundleSelections[item.product_id] || {}
        const itemSizes   = [...new Set(itemVars.map(v => v.size).filter(Boolean))]
        const itemColors  = [...new Set(itemVars.map(v => v.color).filter(Boolean))]
        const itemLengths = [...new Set(itemVars.map(v => v.length).filter(Boolean))]
        if (itemColors.length  && !sel.color)  { setValidationError(`יש לבחור צבע עבור "${item.product_name}"`);  return }
        if (itemLengths.length && !sel.length) { setValidationError(`יש לבחור אורך עבור "${item.product_name}"`); return }
        if (itemSizes.length   && !sel.size)   { setValidationError(`יש לבחור מידה עבור "${item.product_name}"`); return }
      }
      setValidationError('')
      onOrder(product, null, null, null, null, Object.entries(bundleSelections).map(([pid, sel]) => ({ product_id: pid, ...sel })), quantity)
      return
    }
    if (hasComponents) {
      for (let i = 0; i < optionComponents.length; i++) {
        const comp = optionComponents[i]
        const sel = componentSelections[i] || {}
        const compSizes = Array.isArray(comp.sizes) ? comp.sizes.filter(Boolean) : []
        const compColors = Array.isArray(comp.colors) ? comp.colors.filter(Boolean) : []
        const compLengths = Array.isArray(comp.lengths) ? comp.lengths.filter(Boolean) : []
        if (compSizes.length && !sel.size) { setValidationError(`יש לבחור מידה עבור "${comp.name}"`); return }
        if (compColors.length && !sel.color) { setValidationError(`יש לבחור צבע עבור "${comp.name}"`); return }
        if (compLengths.length && !sel.length) { setValidationError(`יש לבחור אורך (ארוך/קצר) עבור "${comp.name}"`); return }
      }
      setValidationError('')
      onOrder(product, selectedOption, null, null, null, componentSelections, quantity)
      return
    }
    if (hasSizes && !sizesAreOptions && !selectedSize) { setValidationError('יש לבחור מידה'); return }
    if (hasColors && !selectedColor) { setValidationError('יש לבחור צבע'); return }
    if (hasLengths && !selectedLength) { setValidationError('יש לבחור אורך (ארוך / קצר)'); return }
    setValidationError('')
    onOrder(product, selectedOption, selectedSize, selectedColor, selectedLength, null, quantity)
  }

  // עדכון בחירה ברכיב — סדר: צבע → אורך → מידה
  // cascade: צבע מאפס ארוך+מידה; ארוך מאפס מידה; מידה ללא אפוס
  function updateComponentSelection(index, field, value) {
    setComponentSelections(prev => {
      const next = [...prev]
      const curr = next[index] || {}
      if (field === 'color') {
        const newVal = curr.color === value ? null : value
        next[index] = { ...curr, color: newVal, length: null, size: null }
      } else if (field === 'length') {
        const newVal = curr.length === value ? null : value
        next[index] = { ...curr, length: newVal, size: null }
      } else { // field === 'size'
        const newVal = curr.size === value ? null : value
        next[index] = { ...curr, size: newVal }
      }
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
        <span className="font-bold text-gray-800 truncate flex-1">
          {editMode ? `✏️ עריכת הזמנה — ${product.title}` : product.title}
        </span>
      </div>

      {/* תמונה */}
      {(() => {
        const displayColor = selectedColor || componentSelections?.[0]?.color || null
        const imgSrc = (product.color_images && displayColor && product.color_images[displayColor]) || product.image_url
        return imgSrc ? (
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            <img
              src={imgSrc}
              alt={product.title}
              className="w-full h-auto max-h-[400px] object-contain"
              loading="lazy"
            />
          </div>
        ) : null
      })()}

      {/* צבעים מהירים מתחת לתמונה */}
      {product.color_images && Object.keys(product.color_images).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-700">🎨 צבע</span>
            {(selectedColor || componentSelections?.[0]?.color) && (
              <span className="text-xs text-emerald-600 font-bold">
                נבחר: {selectedColor || componentSelections?.[0]?.color}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.keys(product.color_images).map(color => {
              const activeColor = selectedColor || componentSelections?.[0]?.color
              const isSelected = activeColor === color
              return (
                <button key={color} type="button"
                  onClick={() => {
                    if (hasComponents) updateComponentSelection(0, 'color', color)
                    else { setSelectedColor(isSelected ? null : color); setSelectedSize(null); setSelectedLength(null); setValidationError('') }
                  }}
                  className={`py-2 px-4 rounded-xl border-2 text-sm font-bold transition ${
                    isSelected ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}>
                  {color}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* כותרת + מחיר */}
      <div>
        <h2 className="text-xl font-bold text-gray-900">{product.title}</h2>
        {product.content && (
          <p className="text-sm text-gray-500 mt-1 leading-relaxed">{product.content}</p>
        )}
        <div className="mt-2">
          <span className="text-3xl font-bold text-emerald-600">
            ₪{selectedOption?.price ?? product.price ?? (hasOptions ? Math.min(...options.filter(o=>o.price!=null).map(o=>o.price)) : '')}
          </span>
        </div>
      </div>

      {/* תיאור מלא + תכונות — מתחת ל"קרא עוד" */}
      {(product.description_long || features.length > 0) && (
        <div>
          <button
            type="button"
            onClick={() => setShowDetails(v => !v)}
            className="text-sm text-emerald-600 font-bold flex items-center gap-1"
          >
            {showDetails ? '▲ הסתר פרטים' : '▼ קרא עוד על המוצר'}
          </button>
          {showDetails && (
            <div className="mt-3 space-y-3">
              {product.description_long && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {product.description_long}
                  </p>
                </div>
              )}
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
            </div>
          )}
        </div>
      )}

      {/* סדר בחירה: קודם אפשרות רכישה, אחר כך צבע/מידה — ראה למטה אחרי בחירת האפשרות */}

      {/* צבע — רק כשאין components ואין options (מוצר פשוט לחלוטין) */}
      {!hasComponents && !hasOptions && hasColors && (
        isBeltProduct
          ? <BeltColorSection headingId="color-heading"
              onToggle={c => { setSelectedColor(c); setSelectedLength(null); setSelectedSize(null); setValidationError('') }} />
          : <div role="group" aria-labelledby="color-heading">
              <div className="flex items-center justify-between mb-2">
                <h3 id="color-heading" className="font-bold text-sm text-gray-800">🎨 בחר צבע</h3>
                {selectedColor && <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedColor}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {colors.map(color => {
                  const isSelected = selectedColor === color
                  const inStock = colorHasStock(color)
                  return (
                    <button key={color} type="button" aria-pressed={isSelected}
                      aria-label={`צבע ${color}${!inStock ? ' - אזל' : ''}`}
                      disabled={!inStock}
                      onClick={() => { setSelectedColor(isSelected ? null : color); setSelectedLength(null); setSelectedSize(null); setValidationError('') }}
                      className={`py-2 px-5 rounded-xl border-2 text-sm font-bold transition ${
                        !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                        : isSelected ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      }`}>
                      {color}
                      {!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                    </button>
                  )
                })}
              </div>
            </div>
      )}

      {/* אורך — רק מוצר פשוט */}
      {!hasComponents && !hasOptions && hasLengths && (
        <div role="group" aria-labelledby="length-heading">
          <div className="flex items-center justify-between mb-2">
            <h3 id="length-heading" className="font-bold text-sm text-gray-800">📐 ארוך / קצר</h3>
            {selectedLength && <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedLength}</span>}
          </div>
          <div className="flex gap-2">
            {lengths.map(len => {
              const isSelected = selectedLength === len
              const inStock = lengthHasStock(len, selectedColor)
              return (
                <button key={len} type="button" aria-pressed={isSelected}
                  aria-label={`אורך ${len}${!inStock ? ' - אזל' : ''}`}
                  disabled={!inStock}
                  onClick={() => { setSelectedLength(isSelected ? null : len); setSelectedSize(null); setValidationError('') }}
                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition ${
                    !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                    : isSelected ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}>
                  {len}
                  {!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* מידות — רק מוצר פשוט */}
      {!hasComponents && !hasOptions && hasSizes && (
        <div role="group" aria-labelledby="size-heading">
          <div className="flex items-center justify-between mb-2">
            <h3 id="size-heading" className="font-bold text-sm text-gray-800">📏 בחר מידה</h3>
            {selectedSize && <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedSize}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map(size => {
              const isSelected = selectedSize === size
              const inStock = sizeHasStock(size, selectedColor, selectedLength)
              return (
                <button key={size} type="button" aria-pressed={isSelected}
                  aria-label={`מידה ${size}${!inStock ? ' - אזל' : ''}`}
                  disabled={!inStock}
                  onClick={() => { setSelectedSize(isSelected ? null : size); setValidationError('') }}
                  className={`min-w-[52px] py-2 px-3 rounded-xl border-2 text-sm font-bold transition relative ${
                    !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                    : isSelected ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}>
                  {size}
                  {!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                </button>
              )
            })}
          </div>
          {(hasColors && !selectedColor) && (
            <p className="text-xs text-gray-400 mt-1.5">בחר צבע תחילה לסינון המידות</p>
          )}
          {(hasLengths && selectedColor && !selectedLength) && (
            <p className="text-xs text-gray-400 mt-1.5">בחר ארוך/קצר לסינון המידות</p>
          )}
        </div>
      )}

      {/* אפשרויות רכישה — נסתר כשיש toggle חגורה */}
      {hasOptions && !addOnOpt && (() => {
        const sorted = [...options].sort((a,b) => (a.price||0)-(b.price||0))
        const base = sorted[0]
        const addOns = sorted.slice(1)
        return (
        <div className="space-y-2">
          {addOns.map((opt, i) => {
              const selected = selectedOption?.name === opt.name && selectedOption?.price === opt.price
              const diff = opt.price != null && base.price != null ? opt.price - base.price : null
              let saving = 0
              if (opt.original_price != null && opt.price != null) saving = parseFloat(opt.original_price) - parseFloat(opt.price)
              else { const m = (opt.note||'').match(/(\d+(?:\.\d+)?)/); saving = m ? parseFloat(m[1]) : 0 }
              return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedOption(selected ? base : opt)}
                      className={`w-full text-right p-3 rounded-xl border-2 transition flex items-center gap-3 ${
                        selected ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white hover:border-emerald-300'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition ${
                        selected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                      }`}>
                        {selected && <span className="text-white text-xs font-bold">✓</span>}
                      </div>
                      <div className="flex-1 min-w-0 text-right">
                        <span className="font-bold text-gray-800 text-sm">{opt.name}</span>
                        {saving > 0 && (
                          <p className="text-xs text-orange-600 font-bold mt-0.5">חסכון של ₪{saving}</p>
                        )}
                      </div>
                      {diff != null && diff > 0 && (
                        <span className="text-sm font-bold text-emerald-600 flex-shrink-0">+₪{diff}</span>
                      )}
                    </button>
                  )
            })}
          </div>
        )
      })()}

      {/* צבע/אורך/מידה לאפשרות ללא רכיבים (תיק בלבד, חליפה בלבד וכו') */}
      {hasOptions && !hasComponents && hasColors && (
        isBeltProduct
          ? <BeltColorSection headingId="color-heading2"
              onToggle={c => { setSelectedColor(c); setSelectedLength(null); setSelectedSize(null); setValidationError('') }} />
          : <div role="group" aria-labelledby="color-heading2">
              <div className="flex items-center justify-between mb-2">
                <h3 id="color-heading2" className="font-bold text-sm text-gray-800">🎨 בחר צבע</h3>
                {selectedColor && <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedColor}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {colors.map(color => {
                  const isSelected = selectedColor === color
                  const inStock = colorHasStock(color)
                  return (
                    <button key={color} type="button" aria-pressed={isSelected}
                      disabled={!inStock}
                      onClick={() => { setSelectedColor(isSelected ? null : color); setSelectedLength(null); setSelectedSize(null); setValidationError('') }}
                      className={`py-2 px-5 rounded-xl border-2 text-sm font-bold transition ${
                        !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                        : isSelected ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                      }`}>
                      {color}{!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                    </button>
                  )
                })}
              </div>
            </div>
      )}
      {hasOptions && !hasComponents && hasLengths && (
        <div role="group" aria-labelledby="length-heading2">
          <div className="flex items-center justify-between mb-2">
            <h3 id="length-heading2" className="font-bold text-sm text-gray-800">📐 ארוך / קצר</h3>
            {selectedLength && <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedLength}</span>}
          </div>
          <div className="flex gap-2">
            {lengths.map(len => {
              const isSelected = selectedLength === len
              const inStock = lengthHasStock(len, selectedColor)
              return (
                <button key={len} type="button" aria-pressed={isSelected}
                  disabled={!inStock}
                  onClick={() => { setSelectedLength(isSelected ? null : len); setSelectedSize(null); setValidationError('') }}
                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-bold transition ${
                    !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                    : isSelected ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}>
                  {len}{!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {hasOptions && !hasComponents && hasSizes && !sizesAreOptions && (
        <div role="group" aria-labelledby="size-heading2">
          <div className="flex items-center justify-between mb-2">
            <h3 id="size-heading2" className="font-bold text-sm text-gray-800">📏 בחר מידה</h3>
            {selectedSize && <span className="text-xs text-emerald-600 font-bold">נבחר: {selectedSize}</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map(size => {
              const isSelected = selectedSize === size
              const inStock = sizeHasStock(size, selectedColor, selectedLength)
              return (
                <button key={size} type="button" aria-pressed={isSelected}
                  disabled={!inStock}
                  onClick={() => { setSelectedSize(isSelected ? null : size); setValidationError('') }}
                  className={`min-w-[52px] py-2 px-3 rounded-xl border-2 text-sm font-bold transition relative ${
                    !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                    : isSelected ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  }`}>
                  {size}{!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                </button>
              )
            })}
          </div>
          {hasColors && !selectedColor && <p className="text-xs text-gray-400 mt-1.5">בחר צבע תחילה</p>}
        </div>
      )}

      {/* בחירת צבע/אורך/מידה פר-רכיב */}
      {hasComponents && (
        <div className="space-y-4">
          {optionComponents.map((comp, idx) => {
            const cName = comp.name || null
            const cVars = getCompVars(cName)
            const hasCV = cVars.length > 0
            const sel = componentSelections[idx] || {}

            // fallback ממוצר מתאים (אם אין variants לרכיב)
            const compProductData = !hasCV ? getCompProductData(comp.name) : { sizes: [], colors: [], lengths: [] }

            // צבעים — מ-variants → מוצר מתאים → JSON
            let compColors = hasCV
              ? [...new Set(cVars.map(v => v.color).filter(Boolean))]
              : compProductData.colors.length > 0 ? compProductData.colors
              : Array.isArray(comp.colors) ? comp.colors.filter(Boolean) : []
            // חגורה: סידור לפי דרגות (בוגרים לבנה→שחורה, ואז ילדים)
            if ((comp.name || '').includes('חגורה')) {
              compColors = [...compColors].sort((a, b) => beltColorIndex(a) - beltColorIndex(b))
            }

            // אורכים — מסוננים לפי צבע שנבחר
            const lengthVars = (hasCV && sel.color)
              ? cVars.filter(v => v.color === sel.color)
              : cVars
            const compLengths = hasCV
              ? [...new Set(lengthVars.map(v => v.length).filter(Boolean))]
              : compProductData.lengths.length > 0 ? compProductData.lengths
              : Array.isArray(comp.lengths) ? comp.lengths.filter(Boolean) : []

            // מידות — מסוננות לפי צבע + אורך שנבחרו
            const sizeVars = hasCV
              ? cVars.filter(v =>
                  (!sel.color || v.color === sel.color) &&
                  (!sel.length || v.length === sel.length)
                )
              : cVars
            const compSizes = sortSizes(hasCV
              ? [...new Set(sizeVars.map(v => v.size).filter(Boolean))]
              : compProductData.sizes.length > 0 ? compProductData.sizes
              : Array.isArray(comp.sizes) ? comp.sizes.filter(Boolean) : [])

            const needsColor = compColors.length > 0
            const needsLength = compLengths.length > 0
            const showSizes = compSizes.length > 0 && (!needsColor || sel.color) && (!needsLength || sel.length)

            // רכיב חגורה (idx>0) — מוצג רק כשהמשתמש בחר להוסיף
            if (idx > 0 && addOnOpt && !addBelt) return null

            return (
              <div key={idx} className="bg-gradient-to-br from-blue-50 to-emerald-50 border border-blue-200 rounded-xl p-3 space-y-3">
                <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">{idx + 1}</span>
                  {comp.name}
                </h3>

                {/* שלב 1: צבע — נסתר לרכיב ראשון כשיש quick picker */}
                {compColors.length > 0 && !(idx === 0 && product.color_images && Object.keys(product.color_images).length > 0) && (() => {
                  const isBelt = (comp.name || '').includes('חגורה')
                  const renderColorBtn = (color) => {
                    const isSelected = sel.color === color
                    const inStock = colorHasStock(color, cName)
                    return (
                      <button
                        key={color}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`${comp.name} צבע ${color}${!inStock ? ' - אזל' : ''}`}
                        disabled={!inStock}
                        onClick={() => updateComponentSelection(idx, 'color', color)}
                        className={`py-1.5 px-3 rounded-lg border-2 text-xs font-bold transition ${
                          !inStock
                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                            : isSelected
                              ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {color}
                        {!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                      </button>
                    )
                  }
                  const adults = isBelt ? compColors.filter(c => beltColorIndex(c) < 5) : []
                  const kids   = isBelt ? compColors.filter(c => { const i = beltColorIndex(c); return i >= 5 && i < 999 }) : []
                  const others = isBelt ? compColors.filter(c => beltColorIndex(c) === 999) : compColors
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-gray-700">🎨 צבע</span>
                        {sel.color && <span className="text-xs text-emerald-600 font-bold">{sel.color}</span>}
                      </div>
                      {isBelt ? (
                        <div className="space-y-2">
                          {adults.length > 0 && (
                            <div>
                              <p className="text-[11px] font-bold text-gray-500 mb-1">👤 חגורות בוגרים</p>
                              <div className="flex flex-wrap gap-1.5">{adults.map(renderColorBtn)}</div>
                            </div>
                          )}
                          {kids.length > 0 && (
                            <div>
                              <p className="text-[11px] font-bold text-gray-500 mb-1">🧒 חגורות ילדים</p>
                              <div className="flex flex-wrap gap-1.5">{kids.map(renderColorBtn)}</div>
                            </div>
                          )}
                          {others.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">{others.map(renderColorBtn)}</div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">{compColors.map(renderColorBtn)}</div>
                      )}
                    </div>
                  )
                })()}

                {/* שלב 2: אורך (מסונן לפי צבע) */}
                {compLengths.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-700">📐 אורך</span>
                      {sel.length && <span className="text-xs text-emerald-600 font-bold">{sel.length}</span>}
                    </div>
                    {needsColor && !sel.color ? (
                      <p className="text-xs text-gray-400">בחר צבע תחילה לסינון האורך</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {compLengths.map(len => {
                          const isSelected = sel.length === len
                          const inStock = lengthHasStock(len, sel.color, cName)
                          return (
                            <button
                              key={len}
                              type="button"
                              aria-pressed={isSelected}
                              aria-label={`${comp.name} אורך ${len}${!inStock ? ' - אזל' : ''}`}
                              disabled={!inStock}
                              onClick={() => updateComponentSelection(idx, 'length', len)}
                              className={`py-1.5 px-4 rounded-lg border-2 text-xs font-bold transition ${
                                !inStock
                                  ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                  : isSelected
                                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              {len}
                              {!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* שלב 3: מידה (מסוננת לפי צבע + אורך) */}
                {compSizes.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-700">📏 מידה</span>
                      {sel.size && <span className="text-xs text-emerald-600 font-bold">{sel.size}</span>}
                    </div>
                    {needsColor && !sel.color ? (
                      <p className="text-xs text-gray-400">בחר צבע תחילה לסינון המידות</p>
                    ) : needsLength && !sel.length ? (
                      <p className="text-xs text-gray-400">בחר ארוך/קצר לסינון המידות</p>
                    ) : showSizes ? (
                      <div className="flex flex-wrap gap-1.5">
                        {compSizes.map(size => {
                          const isSelected = sel.size === size
                          const inStock = sizeHasStock(size, sel.color, sel.length, cName)
                          return (
                            <button
                              key={size}
                              type="button"
                              aria-pressed={isSelected}
                              aria-label={`${comp.name} מידה ${size}${!inStock ? ' - אזל' : ''}`}
                              disabled={!inStock}
                              onClick={() => updateComponentSelection(idx, 'size', size)}
                              className={`min-w-[44px] py-1.5 px-2.5 rounded-lg border-2 text-xs font-bold transition relative ${
                                !inStock
                                  ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                                  : isSelected
                                    ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              {size}
                              {!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                            </button>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* הוסף חגורה — אחרי קופסת המידות */}
      {canShowBeltAddon && (
        <div className={`rounded-xl border-2 transition p-3 ${addBelt ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 bg-white'}`}>
          <button type="button" onClick={toggleBelt} className="w-full flex items-center gap-3 text-right">
            <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition ${addBelt ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'}`}>
              {addBelt && <span className="text-white text-xs font-bold">✓</span>}
            </div>
            <div className="flex-1">
              <span className="font-bold text-gray-800 text-sm">הוסף חגורה</span>
              <span className="text-xs text-gray-500 mr-2">
                <span className="text-emerald-600 font-bold">₪{addOnDiff}</span>
                {' '}
                <span className="line-through text-gray-400">במקום ₪{addOnOpt?.original_price ? addOnOpt.original_price - (baseOpt?.price||0) : 100}</span>
              </span>
            </div>
          </button>
        </div>
      )}

      {/* סרגל הזמנה */}
      <div className="pt-2 border-t">
        {/* סיכום בחירות */}
        {!alreadyOrdered && (hasSizes || hasColors || hasLengths || hasOptions || hasComponents) && (
          <div className="mb-3 p-2.5 bg-gray-50 rounded-xl text-xs text-gray-600 space-y-0.5">
            {hasOptions && selectedOption && (
              <div>📦 אפשרות: <span className="font-bold text-gray-800">{selectedOption.name}</span></div>
            )}
            {/* סיכום לוריאציה פשוטה */}
            {!hasComponents && hasSizes && !sizesAreOptions && (
              <div>📏 מידה: <span className="font-bold text-gray-800">{selectedSize || '— לא נבחר'}</span></div>
            )}
            {!hasComponents && hasColors && (
              <div>🎨 צבע: <span className="font-bold text-gray-800">{selectedColor || '— לא נבחר'}</span></div>
            )}
            {!hasComponents && hasLengths && (
              <div>📐 אורך: <span className="font-bold text-gray-800">{selectedLength || '— לא נבחר'}</span></div>
            )}
            {/* סיכום פר-רכיב */}
            {hasComponents && optionComponents.map((comp, i) => {
              const sel = componentSelections[i] || {}
              const parts = []
              if (Array.isArray(comp.sizes) && comp.sizes.length) parts.push(`מידה: ${sel.size || '— לא נבחר'}`)
              if (Array.isArray(comp.colors) && comp.colors.length) parts.push(`צבע: ${sel.color || '— לא נבחר'}`)
              if (Array.isArray(comp.lengths) && comp.lengths.length) parts.push(`אורך: ${sel.length || '— לא נבחר'}`)
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

        {/* בחירת כמות — רק כשלא הוזמן עדיין */}
        {!alreadyOrdered && (
          <div className="flex items-center justify-between gap-3 mb-3 bg-gray-50 rounded-xl px-3 py-2">
            <span className="text-sm text-gray-700 font-medium">כמות</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 transition"
              >−</button>
              <span className="w-8 text-center font-bold text-gray-900">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(q => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-700 font-bold text-lg flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 transition"
              >+</button>
            </div>
          </div>
        )}

        {/* ── בחירת מידה/צבע לכל פריט בחבילה ── */}
        {isBundle && bundleItems.map(item => {
          const itemVars = compVariantsMap[item.product_id] || []
          const sel = bundleSelections[item.product_id] || {}
          const itemColors  = [...new Set(itemVars.map(v => v.color).filter(Boolean))]
          const itemLengths = [...new Set(
            itemVars.filter(v => !sel.color || v.color === sel.color).map(v => v.length).filter(Boolean)
          )]
          const itemSizes   = [...new Set(
            itemVars.filter(v => (!sel.color || v.color === sel.color) && (!sel.length || v.length === sel.length)).map(v => v.size).filter(Boolean)
          )]
          const stockOk = (color, length, size) => {
            if (!itemVars.length) return true
            return itemVars.some(v =>
              (!color  || v.color  === color)  &&
              (!length || v.length === length) &&
              (!size   || v.size   === size)   &&
              (v.stock || 0) > 0
            )
          }
          return (
            <div key={item.product_id} className="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-3 space-y-3">
              <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
                <span className="bg-purple-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">🎁</span>
                {item.product_name}
              </h3>
              {itemColors.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-1.5">צבע</p>
                  <div className="flex flex-wrap gap-2">
                    {itemColors.map(color => {
                      const inStock = stockOk(color, null, null)
                      const isSelected = sel.color === color
                      return (
                        <button key={color} type="button" disabled={!inStock}
                          onClick={() => updateBundleSel(item.product_id, 'color', isSelected ? null : color)}
                          className={`py-1.5 px-3 rounded-lg border-2 text-xs font-bold transition ${
                            !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                            : isSelected ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                          }`}>
                          {color}{!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {itemLengths.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-1.5">אורך</p>
                  <div className="flex flex-wrap gap-2">
                    {itemLengths.map(len => {
                      const inStock = stockOk(sel.color, len, null)
                      const isSelected = sel.length === len
                      return (
                        <button key={len} type="button" disabled={!inStock}
                          onClick={() => updateBundleSel(item.product_id, 'length', isSelected ? null : len)}
                          className={`py-1.5 px-4 rounded-lg border-2 text-xs font-bold transition ${
                            !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                            : isSelected ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                          }`}>
                          {len}{!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {itemSizes.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-1.5">מידה</p>
                  <div className="flex flex-wrap gap-2">
                    {itemSizes.map(size => {
                      const inStock = stockOk(sel.color, sel.length, size)
                      const isSelected = sel.size === size
                      return (
                        <button key={size} type="button" disabled={!inStock}
                          onClick={() => updateBundleSel(item.product_id, 'size', isSelected ? null : size)}
                          className={`min-w-[44px] py-1.5 px-2.5 rounded-lg border-2 text-xs font-bold transition ${
                            !inStock ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60'
                            : isSelected ? 'border-emerald-500 bg-emerald-500 text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                          }`}>
                          {size}{!inStock && <span className="block text-[8px] font-normal">אזל</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {itemVars.length === 0 && (
                <p className="text-xs text-gray-400">אין נתוני מלאי עבור מוצר זה</p>
              )}
            </div>
          )
        })}

        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm text-gray-600">סה"כ לתשלום</div>
          {displayTotal != null && (
            <div className="text-2xl font-bold text-emerald-600">
              ₪{displayTotal}
              {quantity > 1 && <span className="text-sm font-normal text-gray-400 mr-1">(₪{displayPrice} × {quantity})</span>}
            </div>
          )}
        </div>

        {outOfStock ? (
          <div className="w-full py-3 rounded-xl text-sm font-bold text-center bg-gray-100 text-gray-400">
            ❌ אזל מהמלאי
          </div>
        ) : editMode ? (
          <button
            onClick={handleOrderClick}
            disabled={ordering}
            className="w-full py-3 rounded-xl text-sm font-bold transition disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-700"
          >
            {ordering ? '...' : '💾 שמור שינויים'}
          </button>
        ) : alreadyOrdered ? (
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
              >
                ✏️ ערוך הזמנה
              </button>
            )}
            <button
              onClick={handleOrderClick}
              disabled={ordering}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition disabled:opacity-50 bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              {ordering ? '...' : '🗑 בטל הזמנה'}
            </button>
          </div>
        ) : (
          <button
            onClick={handleOrderClick}
            disabled={ordering}
            className="w-full py-3 rounded-xl text-sm font-bold transition disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {ordering
              ? '...'
              : hasOptions && selectedOption
              ? `הזמן "${selectedOption.name}" — ₪${displayTotal ?? selectedOption.price}`
              : `הזמן עכשיו${displayTotal != null ? ` — ₪${displayTotal}` : ''}`}
          </button>
        )}
        <p className="text-[11px] text-gray-400 text-center mt-2">
          ההזמנה תישלח למאמן · התשלום יתבצע באימון הקרוב
        </p>
      </div>

      {/* חבילות שמכילות את המוצר הזה */}
      {!isBundle && relatedBundles.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-bold text-sm text-gray-700">🎁 זמין גם בחבילה:</h3>
          {relatedBundles.map(bundle => (
            <div key={bundle.id} className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-800 text-sm">{bundle.title}</p>
                <p className="text-xs text-gray-500">{(bundle.bundle_items || []).map(i => i.product_name).join(' + ')}</p>
              </div>
              {bundle.price != null && (
                <span className="text-emerald-600 font-bold text-sm flex-shrink-0">₪{bundle.price}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
