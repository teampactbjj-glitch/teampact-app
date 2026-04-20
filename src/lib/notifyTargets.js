import { supabase } from './supabase'

// Returns user_ids of trainers to notify about a new pending registration.
// Prefers trainers tied to the member's requested coach names; falls back to all trainers.
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

// Active athlete user_ids (where a matching auth user exists) filtered by branch.
export async function athleteUserIdsForBranch(branchId) {
  if (!branchId) return []
  const { data } = await supabase
    .from('members')
    .select('user_id, branch_ids, branch_id')
    .not('user_id', 'is', null)
    .eq('active', true)
  return (data || [])
    .filter(m => (m.branch_ids || []).includes(branchId) || m.branch_id === branchId)
    .map(m => m.user_id)
}

export async function athleteUserIdsForCoach(coachName) {
  if (!coachName) return []
  const { data } = await supabase
    .from('members')
    .select('user_id, requested_coach_name, requested_coach_names')
    .not('user_id', 'is', null)
    .eq('active', true)
  return (data || [])
    .filter(m =>
      m.requested_coach_name === coachName ||
      (Array.isArray(m.requested_coach_names) && m.requested_coach_names.includes(coachName))
    )
    .map(m => m.user_id)
}

export async function athleteUserIdFromMemberId(memberId) {
  if (!memberId) return null
  const { data } = await supabase
    .from('members')
    .select('user_id')
    .eq('id', memberId)
    .maybeSingle()
  return data?.user_id || null
}

export async function allActiveAthleteUserIds() {
  const { data } = await supabase
    .from('members')
    .select('user_id')
    .not('user_id', 'is', null)
    .eq('active', true)
  return (data || []).map(m => m.user_id).filter(Boolean)
}
