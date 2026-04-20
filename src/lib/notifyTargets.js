import { supabase } from './supabase'

// Members' id is the auth user_id (RegisterPage inserts memberPayload.id = userId).

export async function trainerUserIdsForMember(member) {
  const requestedNames = Array.isArray(member?.requested_coach_names)
    ? member.requested_coach_names.filter(Boolean)
    : (member?.requested_coach_name ? [member.requested_coach_name] : [])

  if (requestedNames.length) {
    const { data } = await supabase
      .from('coaches')
      .select('user_id')
      .in('name', requestedNames)
    const ids = (data || []).map(c => c.user_id).filter(Boolean)
    if (ids.length) return ids
  }
  return allTrainerUserIds()
}

export async function allTrainerUserIds() {
  const { data } = await supabase.from('profiles').select('id').eq('role', 'trainer')
  return (data || []).map(p => p.id).filter(Boolean)
}

export async function allAdminUserIds() {
  const { data } = await supabase.from('profiles').select('id').eq('is_admin', true)
  return (data || []).map(p => p.id).filter(Boolean)
}

export async function athleteUserIdsForBranch(branchId) {
  if (!branchId) return []
  return athleteUserIdsForBranches([branchId])
}

export async function athleteUserIdsForBranches(branchIds) {
  if (!Array.isArray(branchIds) || branchIds.length === 0) return []
  const { data } = await supabase
    .from('members')
    .select('id, branch_ids, branch_id')
    .eq('active', true)
  const targetSet = new Set(branchIds.filter(Boolean))
  return (data || [])
    .filter(m => {
      const mb = (m.branch_ids && m.branch_ids.length) ? m.branch_ids : (m.branch_id ? [m.branch_id] : [])
      return mb.some(b => targetSet.has(b))
    })
    .map(m => m.id)
    .filter(Boolean)
}

export async function athleteUserIdsForCoach(coachName) {
  if (!coachName) return []
  const { data } = await supabase
    .from('members')
    .select('id, requested_coach_name, requested_coach_names')
    .eq('active', true)
  return (data || [])
    .filter(m =>
      m.requested_coach_name === coachName ||
      (Array.isArray(m.requested_coach_names) && m.requested_coach_names.includes(coachName))
    )
    .map(m => m.id)
    .filter(Boolean)
}

export async function athleteUserIdFromMemberId(memberId) {
  // members.id IS the auth user_id.
  return memberId || null
}

export async function allActiveAthleteUserIds() {
  const { data } = await supabase
    .from('members')
    .select('id')
    .eq('active', true)
  return (data || []).map(m => m.id).filter(Boolean)
}
