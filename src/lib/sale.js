// מבצע על מוצר בחנות: sale_price + sale_end_date (כולל היום עצמו, עד 23:59).
// מחזיר את מחיר המבצע אם הוא בתוקף ונמוך מהמחיר הרגיל, אחרת null.
export function activeSalePrice(item, now = new Date()) {
  if (!item || item.sale_price == null || item.sale_price === '') return null
  const sp = Number(item.sale_price)
  if (!Number.isFinite(sp) || sp < 0) return null
  if (item.sale_end_date) {
    const end = new Date(item.sale_end_date + 'T23:59:59')
    if (now > end) return null
  }
  const base = item.price != null ? Number(item.price) : null
  if (base != null && sp >= base) return null
  return sp
}

export function saleEndLabel(item) {
  if (!item?.sale_end_date) return ''
  return new Date(item.sale_end_date + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}
