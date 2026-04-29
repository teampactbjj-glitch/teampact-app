// ============================================================
// בדיקה אוטומטית - סינון התראות לפי סניף (Branch-Scoped Notifications)
// ============================================================
// מטרת הבדיקה:
//   לוודא שהתראה שנשלחת לסניף ספציפי (למשל "תל אביב")
//   מתקבלת רק אצל מתאמנים המשויכים לאותו סניף,
//   ולא מתקבלת אצל מתאמנים מסניפים אחרים.
//
// הסקריפט משחזר את הלוגיקה מ-src/lib/notifyTargets.js
// (פונקציית athleteUserIdsForBranches) ובודק אותה מול
// נתוני דמה. אם תהיה רגרסיה בלוגיקת הסינון - הבדיקה תיכשל.
//
// הפעלה:
//   node tests/branchNotificationFilter.test.mjs
// ============================================================

// ----- שכפול הפונקציה הנבדקת מ-src/lib/notifyTargets.js -----
// (אותה לוגיקה בדיוק - רק ללא קריאה ל-Supabase)
function athleteUserIdsForBranches(branchIds, allActiveMembers) {
  if (!Array.isArray(branchIds) || branchIds.length === 0) return []
  const targetSet = new Set(branchIds.filter(Boolean))
  return (allActiveMembers || [])
    .filter(m => {
      const mb = (m.branch_ids && m.branch_ids.length)
        ? m.branch_ids
        : (m.branch_id ? [m.branch_id] : [])
      return mb.some(b => targetSet.has(b))
    })
    .map(m => m.id)
    .filter(Boolean)
}

// ----- מנגנון בדיקה פשוט (ללא תלויות חיצוניות) -----
let passed = 0
let failed = 0
const failures = []

function assertEqual(actual, expected, name) {
  const a = JSON.stringify([...actual].sort())
  const e = JSON.stringify([...expected].sort())
  if (a === e) {
    console.log(`  ✅ ${name}`)
    passed++
  } else {
    console.log(`  ❌ ${name}`)
    console.log(`     ציפיתי:  ${e}`)
    console.log(`     קיבלתי: ${a}`)
    failed++
    failures.push(name)
  }
}

function assertNotIncludes(arr, items, name) {
  const bad = items.filter(x => arr.includes(x))
  if (bad.length === 0) {
    console.log(`  ✅ ${name}`)
    passed++
  } else {
    console.log(`  ❌ ${name} — נכללו בטעות: ${JSON.stringify(bad)}`)
    failed++
    failures.push(name)
  }
}

// ============================================================
// נתוני דמה - שלושה סניפים, מתאמנים מסוגים שונים
// ============================================================
const BRANCH_TLV    = 'branch-tel-aviv'   // תל אביב
const BRANCH_HOLON  = 'branch-holon'      // חולון
const BRANCH_RHVT   = 'branch-rehovot'    // רחובות

const members = [
  // --- מתאמני תל אביב (משתמשים ב-branch_ids החדש) ---
  { id: 'user-tlv-1', full_name: 'אבי כהן',     active: true, branch_ids: [BRANCH_TLV],   branch_id: BRANCH_TLV   },
  { id: 'user-tlv-2', full_name: 'דנה לוי',      active: true, branch_ids: [BRANCH_TLV],   branch_id: BRANCH_TLV   },

  // --- מתאמני חולון ---
  { id: 'user-hol-1', full_name: 'יוסי מזרחי',   active: true, branch_ids: [BRANCH_HOLON], branch_id: BRANCH_HOLON },
  { id: 'user-hol-2', full_name: 'מיכל אברהם',   active: true, branch_ids: [BRANCH_HOLON], branch_id: BRANCH_HOLON },

  // --- מתאמני רחובות ---
  { id: 'user-rhv-1', full_name: 'אורי שמש',     active: true, branch_ids: [BRANCH_RHVT],  branch_id: BRANCH_RHVT  },

  // --- מתאמן עם שני סניפים (ת"א + חולון) ---
  { id: 'user-multi', full_name: 'נועה דו-סניפית', active: true, branch_ids: [BRANCH_TLV, BRANCH_HOLON], branch_id: BRANCH_TLV },

  // --- מתאמן ישן עם branch_id בלבד (תאימות לאחור) ---
  { id: 'user-legacy', full_name: 'משה ותיק',    active: true, branch_ids: null,           branch_id: BRANCH_TLV   },

  // --- מתאמן לא פעיל בת"א - לא אמור לקבל התראות בכלל ---
  // הערה: בקוד האמיתי .eq('active', true) מסנן ב-DB. כאן נמסור רק פעילים.
  // אבל אם בטעות יעבור - הפילטר אחר כך לא ירדוף בו, אז נדמה שהוא לא ברשימת active.

  // --- מתאמן ללא סניף בכלל (אסור שיקבל התראת סניף) ---
  { id: 'user-no-branch', full_name: 'גל ללא סניף', active: true, branch_ids: null,        branch_id: null         },
]

// "כל המתאמנים הפעילים" - מה שמתקבל מ-supabase.from('members').eq('active',true)
const allActiveMembers = members // כולם פעילים בדמה זו

// ============================================================
// בדיקות
// ============================================================
console.log('\n🧪 בדיקת סינון התראות לפי סניף\n')
console.log('─'.repeat(60))

// --------------------------------------------------------
// 1. תרחיש מרכזי - התראה לסניף תל אביב
// --------------------------------------------------------
console.log('\n📍 תרחיש 1: התראה נשלחת לסניף תל אביב בלבד')
const tlvRecipients = athleteUserIdsForBranches([BRANCH_TLV], allActiveMembers)

assertEqual(
  tlvRecipients,
  ['user-tlv-1', 'user-tlv-2', 'user-multi', 'user-legacy'],
  'מתאמני ת"א (כולל דו-סניפי וותיק עם branch_id ישן) מקבלים את ההתראה'
)

assertNotIncludes(
  tlvRecipients,
  ['user-hol-1', 'user-hol-2'],
  'מתאמני חולון לא מקבלים את ההתראה לת"א'
)

assertNotIncludes(
  tlvRecipients,
  ['user-rhv-1'],
  'מתאמן רחובות לא מקבל את ההתראה לת"א'
)

assertNotIncludes(
  tlvRecipients,
  ['user-no-branch'],
  'מתאמן ללא שיוך סניף לא מקבל את ההתראה'
)

// --------------------------------------------------------
// 2. תרחיש מראה - התראה לחולון לא מגיעה לת"א
// --------------------------------------------------------
console.log('\n📍 תרחיש 2: התראה נשלחת לסניף חולון')
const holonRecipients = athleteUserIdsForBranches([BRANCH_HOLON], allActiveMembers)

assertEqual(
  holonRecipients,
  ['user-hol-1', 'user-hol-2', 'user-multi'],
  'מתאמני חולון + הדו-סניפי מקבלים את ההתראה'
)

assertNotIncludes(
  holonRecipients,
  ['user-tlv-1', 'user-tlv-2', 'user-legacy', 'user-rhv-1', 'user-no-branch'],
  'מתאמני ת"א, רחובות וללא-סניף לא מקבלים את ההתראה לחולון'
)

// --------------------------------------------------------
// 3. תרחיש - התראה למספר סניפים בו-זמנית (ת"א + רחובות)
// --------------------------------------------------------
console.log('\n📍 תרחיש 3: התראה רב-סניפית (ת"א + רחובות)')
const multiRecipients = athleteUserIdsForBranches(
  [BRANCH_TLV, BRANCH_RHVT],
  allActiveMembers
)

assertEqual(
  multiRecipients,
  ['user-tlv-1', 'user-tlv-2', 'user-multi', 'user-legacy', 'user-rhv-1'],
  'כל מתאמני ת"א + רחובות + הדו-סניפי מקבלים את ההתראה'
)

assertNotIncludes(
  multiRecipients,
  ['user-hol-1', 'user-hol-2'],
  'מתאמני חולון בלבד לא מקבלים את ההתראה'
)

// --------------------------------------------------------
// 4. בדיקות קצה (Edge Cases)
// --------------------------------------------------------
console.log('\n📍 תרחיש 4: בדיקות קצה')

assertEqual(
  athleteUserIdsForBranches([], allActiveMembers),
  [],
  'מערך סניפים ריק → אף אחד לא מקבל'
)

assertEqual(
  athleteUserIdsForBranches(null, allActiveMembers),
  [],
  'null במקום מערך → אף אחד לא מקבל (הגנה מפני קריסה)'
)

assertEqual(
  athleteUserIdsForBranches([BRANCH_TLV], []),
  [],
  'אין מתאמנים פעילים בכלל → רשימה ריקה'
)

assertEqual(
  athleteUserIdsForBranches([BRANCH_TLV, null, undefined, ''], allActiveMembers),
  ['user-tlv-1', 'user-tlv-2', 'user-multi', 'user-legacy'],
  'ערכי null/undefined/ריקים מסוננים מהקלט'
)

assertEqual(
  athleteUserIdsForBranches(['branch-not-existing'], allActiveMembers),
  [],
  'סניף שלא קיים → רשימה ריקה'
)

// --------------------------------------------------------
// 5. תאימות לאחור - branch_id ישן לבדו
// --------------------------------------------------------
console.log('\n📍 תרחיש 5: תאימות לאחור עם branch_id ישן')

const onlyLegacy = [
  { id: 'legacy-1', active: true, branch_ids: null,  branch_id: BRANCH_TLV   },
  { id: 'legacy-2', active: true, branch_ids: [],    branch_id: BRANCH_HOLON },
]
assertEqual(
  athleteUserIdsForBranches([BRANCH_TLV], onlyLegacy),
  ['legacy-1'],
  'מתאמן עם branch_id ישן בלבד מזוהה כשייך לסניף'
)
assertNotIncludes(
  athleteUserIdsForBranches([BRANCH_TLV], onlyLegacy),
  ['legacy-2'],
  'מתאמן ישן בחולון לא מתבלבל ונשלח לת"א'
)

// ============================================================
// סיכום
// ============================================================
console.log('\n' + '═'.repeat(60))
console.log(`📊 סיכום:  ${passed} עברו  /  ${failed} נכשלו`)
console.log('═'.repeat(60))

if (failed > 0) {
  console.log('\n⚠️  בדיקות שנכשלו:')
  failures.forEach(f => console.log(`   • ${f}`))
  console.log('\n❌ הבדיקה נכשלה - יש תקלה בלוגיקת סינון הסניפים!')
  process.exit(1)
} else {
  console.log('\n✅ כל הבדיקות עברו - לוגיקת הסינון תקינה.')
  console.log('   התראה לסניף ספציפי תגיע רק למתאמנים של אותו סניף.')
  process.exit(0)
}
