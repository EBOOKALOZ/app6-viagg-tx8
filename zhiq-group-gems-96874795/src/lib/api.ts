import { supabase } from '@/integrations/supabase/client';
import { deriveVisualStatus } from '@/lib/groupStatusUtils';

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WhatsAppGroup {
  id: string;
  user_id: string;
  name: string;
  link: string | null;
  created_at: string;
}

export interface CommissionOverride {
  id: string;
  user_id: string;
  custom_rate: number;
  set_by_admin: string | null;
  created_at: string;
}

export interface AdvertiserCreditInfo {
  available_credits: number;
  environment: string;
}

export interface DriverWhatsAppGroup {
  id: string;
  user_id: string;
  link: string;
  cidade: string;
  estado: string;
  tipo: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Commission rate calculation based on ACTIVE groups (driver + motoboy)
// Updated: max 3 groups (simplified onboarding)
// 0 groups → 25%
// 1 group → 18%
// 2 groups → 11%
// 3+ groups → 6%
export function calculateCommissionRate(activeGroupCount: number): number {
  if (activeGroupCount >= 3) return 6;
  if (activeGroupCount === 2) return 12;
  if (activeGroupCount === 1) return 18;
  return 25;
}

// Get next commission goal info
export function getNextCommissionGoal(activeGroupCount: number): { groupsNeeded: number; nextRate: number } | null {
  if (activeGroupCount >= 3) return null; // Already at max
  const goals = [
    { threshold: 3, rate: 6 },
    { threshold: 2, rate: 11 },
    { threshold: 1, rate: 18 },
  ];
  const nextGoal = goals.find(g => g.threshold > activeGroupCount);
  if (!nextGoal) return null;
  return { groupsNeeded: nextGoal.threshold - activeGroupCount, nextRate: nextGoal.rate };
}

// Get user profile
export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  return { data: data as UserProfile | null, error };
}

// Update user profile
export async function updateUserProfile(userId: string, updates: Partial<UserProfile>) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  return { data: data as UserProfile | null, error };
}

// Get user's WhatsApp groups (legacy - whatsapp_groups table)
export async function getUserGroups(userId: string) {
  const { data, error } = await supabase
    .from('whatsapp_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { data: data as WhatsAppGroup[] | null, error };
}

// Get profile-specific WhatsApp groups based on active profile type
// Motoboy uses the unified whatsapp_groups table; others use profile-specific tables
export async function getProfileGroups(userId: string, profileType: string) {
  if (profileType === 'motoboy') {
    // Unified table – motoboy groups are linked via owner_user_id
    const { data, error } = await (supabase
      .from('whatsapp_groups') as any)
      .select('id, owner_user_id, group_link, group_name, city_name, state_code, neighborhood, validation_status, is_active, created_at, updated_at')
      .eq('owner_user_id', userId)
      .order('created_at', { ascending: false });

    // Map columns to match the interface expected by the Groups page
    const mapped = (data || []).map((g: any) => ({
      id: g.id,
      user_id: g.owner_user_id,
      link: g.group_link || '',
      cidade: g.city_name || g.group_name || '',
      estado: g.state_code || '',
      tipo: g.neighborhood || 'Geral',
      status: deriveVisualStatus(g),
      created_at: g.created_at,
      updated_at: g.updated_at || g.created_at,
    }));

    return { data: mapped, error };
  }

  const tableMap: Record<string, string> = {
    driver: 'driver_whatsapp_groups',
    merchant: 'merchant_whatsapp_groups',
  };

  const tableName = tableMap[profileType];
  if (!tableName) {
    return { data: null, error: new Error('Invalid profile type') };
  }

  const { data, error } = await supabase
    .from(tableName as 'driver_whatsapp_groups' | 'merchant_whatsapp_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  return { data, error };
}

// Add WhatsApp group to profile-specific table
// Motoboy inserts into the unified whatsapp_groups table
export async function addProfileGroup(
  userId: string,
  profileType: string,
  groupData: { link: string; cidade: string; estado?: string; tipo?: string }
) {
  if (profileType === 'motoboy') {
    const { data, error } = await supabase.rpc('try_create_whatsapp_group' as any, {
      p_link: groupData.link.trim(),
      p_city: groupData.cidade,
      p_group_type: groupData.tipo || 'Geral',
      p_created_by: userId,
    });

    if (error) {
      return { data: null, error };
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result && result.created === false) {
      return { data: null, error: { code: '23505', message: 'duplicate' } };
    }

    return { data: result, error: null };
  }

  if (profileType === 'driver') {
    const { data, error } = await supabase.rpc('try_create_driver_whatsapp_group' as any, {
      p_link: groupData.link.trim(),
      p_cidade: groupData.cidade,
      p_estado: groupData.estado || '',
      p_tipo: groupData.tipo || 'Geral',
      p_user_id: userId,
    });

    if (error) {
      return { data: null, error };
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result && result.created === false) {
      return { data: null, error: { code: '23505', message: 'duplicate' } as any };
    }

    return { data: result, error: null };
  }

  if (profileType === 'merchant') {
    const { data, error } = await supabase.rpc('try_create_merchant_whatsapp_group' as any, {
      p_link: groupData.link.trim(),
      p_cidade: groupData.cidade,
      p_estado: groupData.estado || '',
      p_tipo: groupData.tipo || 'Geral',
      p_user_id: userId,
    });

    if (error) {
      return { data: null, error };
    }

    const result = Array.isArray(data) ? data[0] : data;
    if (result && result.created === false) {
      return { data: null, error: { code: '23505', message: 'duplicate' } as any };
    }

    return { data: result, error: null };
  }

  return { data: null, error: new Error('Invalid profile type') };
}

// Add WhatsApp group (legacy) — uses RPC to avoid 23505
export async function addWhatsAppGroup(userId: string, name: string, link?: string) {
  const { data, error } = await supabase.rpc('try_create_whatsapp_group' as any, {
    p_link: (link || '').trim(),
    p_city: name,
    p_group_type: 'Geral',
    p_created_by: userId,
  });

  if (error) return { data: null, error };

  const result = Array.isArray(data) ? data[0] : data;
  if (result && result.created === false) {
    return { data: null, error: { code: '23505', message: 'duplicate' } as any };
  }

  return { data: result as WhatsAppGroup | null, error: null };
}

// Delete WhatsApp group (legacy)
export async function deleteWhatsAppGroup(groupId: string) {
  const { error } = await supabase
    .from('whatsapp_groups')
    .delete()
    .eq('id', groupId);

  return { error };
}

// Get commission override for user
export async function getCommissionOverride(userId: string) {
  const { data, error } = await supabase
    .from('commission_overrides')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return { data: data as CommissionOverride | null, error };
}

// ADMIN FUNCTIONS

// Get all users with their data (real group counts from driver + motoboy tables)
export async function getAllUsers() {
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (profilesError) return { data: null, error: profilesError };

  // Get user roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id, role');

  const rolesMap = new Map<string, string[]>();
  userRoles?.forEach(r => {
    const existing = rolesMap.get(r.user_id) || [];
    existing.push(r.role);
    rolesMap.set(r.user_id, existing);
  });

  // Fetch ALL driver groups with status 'ativo'
  const { data: allDriverGroups } = await supabase
    .from('driver_whatsapp_groups')
    .select('user_id')
    .eq('status', 'ativo');

  // Fetch ALL motoboy groups with status 'ativo'
  const { data: allMotoboyGroups } = await supabase
    .from('motoboy_whatsapp_groups')
    .select('user_id')
    .eq('status', 'ativo');

  // Fetch ALL merchant groups with status 'ativo'
  const { data: allMerchantGroups } = await supabase
    .from('merchant_whatsapp_groups')
    .select('user_id')
    .eq('status', 'ativo');

  // Build maps of active group counts per user
  const driverGroupCountMap = new Map<string, number>();
  allDriverGroups?.forEach(g => {
    driverGroupCountMap.set(g.user_id, (driverGroupCountMap.get(g.user_id) || 0) + 1);
  });

  const motoboyGroupCountMap = new Map<string, number>();
  allMotoboyGroups?.forEach(g => {
    motoboyGroupCountMap.set(g.user_id, (motoboyGroupCountMap.get(g.user_id) || 0) + 1);
  });

  const merchantGroupCountMap = new Map<string, number>();
  allMerchantGroups?.forEach(g => {
    merchantGroupCountMap.set(g.user_id, (merchantGroupCountMap.get(g.user_id) || 0) + 1);
  });

  // Fetch all commission overrides
  const { data: allOverrides } = await supabase
    .from('commission_overrides')
    .select('user_id, custom_rate');

  const overridesMap = new Map<string, number>();
  allOverrides?.forEach(o => {
    overridesMap.set(o.user_id, o.custom_rate);
  });

  // Fetch advertiser credit balances
  const { data: allCreditBalances } = await supabase
    .from('advertiser_credit_balances')
    .select('advertiser_account_id, available_credits');

  // Fetch advertiser accounts to map to user_id
  const { data: advertiserAccounts } = await supabase
    .from('advertiser_accounts')
    .select('id, user_id');

  const accountIdToUserId = new Map<string, string>();
  advertiserAccounts?.forEach(a => accountIdToUserId.set(a.id, a.user_id));

  const userCreditsMap = new Map<string, number>();
  allCreditBalances?.forEach(cb => {
    const userId = accountIdToUserId.get(cb.advertiser_account_id);
    if (userId) userCreditsMap.set(userId, cb.available_credits);
  });

  // Build user data with real counts (driver + motoboy + merchant)
  const usersWithData = (profiles || []).map((profile) => {
    const driverActiveGroups = driverGroupCountMap.get(profile.id) || 0;
    const motoboyActiveGroups = motoboyGroupCountMap.get(profile.id) || 0;
    const merchantActiveGroups = merchantGroupCountMap.get(profile.id) || 0;
    const totalActiveGroups = driverActiveGroups + motoboyActiveGroups + merchantActiveGroups;

    const overrideRate = overridesMap.get(profile.id);
    const commissionRate = overrideRate ?? calculateCommissionRate(totalActiveGroups);

    const availableProfiles = (profile.available_profiles as string[]) || [];
    const roles = rolesMap.get(profile.id) || [];
    const availableCredits = userCreditsMap.get(profile.id) ?? 0;

    return {
      ...profile,
      groupCount: totalActiveGroups,
      commissionRate,
      hasOverride: overrideRate !== undefined,
      availableProfiles,
      isAdmin: roles.includes('admin'),
      availableCredits
    };
  });

  return { data: usersWithData, error: null };
}

// Get user details for admin (includes driver, motoboy and merchant groups with status)
export async function getAdminUserDetails(userId: string) {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError) return { data: null, error: profileError };

  // Fetch old whatsapp_groups (legacy)
  const { data: legacyGroups } = await supabase
    .from('whatsapp_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Fetch driver_whatsapp_groups
  const { data: rawDriverGroups } = await supabase
    .from('driver_whatsapp_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Fetch motoboy_whatsapp_groups
  const { data: rawMotoboyGroups } = await supabase
    .from('motoboy_whatsapp_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Fetch merchant_whatsapp_groups
  const { data: rawMerchantGroups } = await supabase
    .from('merchant_whatsapp_groups')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  // Deduplicate groups by ID first, then by link within each type
  const deduplicateGroups = <T extends { id: string; link: string }>(groups: T[] | null): T[] => {
    if (!groups) return [];
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();
    return groups.filter(group => {
      if (seenIds.has(group.id)) return false;
      if (seenLinks.has(group.link)) return false;
      seenIds.add(group.id);
      seenLinks.add(group.link);
      return true;
    });
  };

  const driverGroups = deduplicateGroups(rawDriverGroups);
  const motoboyGroups = deduplicateGroups(rawMotoboyGroups);
  const merchantGroups = deduplicateGroups(rawMerchantGroups);

  const { data: override } = await supabase
    .from('commission_overrides')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  // Fetch driver_profiles for selfie/CNH images
  const { data: driverProfile } = await supabase
    .from('driver_profiles')
    .select('selfie_url, cnh_url')
    .eq('user_id', userId)
    .maybeSingle();

  // Fetch user roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  // Count groups per type (using deduplicated arrays)
  const totalDriverGroups = driverGroups.length;
  const activeDriverGroups = driverGroups.filter(g => g.status === 'ativo').length;

  const totalMotoboyGroups = motoboyGroups.length;
  const activeMotoboyGroups = motoboyGroups.filter(g => g.status === 'ativo').length;

  const totalMerchantGroups = merchantGroups.length;
  const activeMerchantGroups = merchantGroups.filter(g => g.status === 'ativo').length;

  const legacyGroupCount = legacyGroups?.length || 0;

  // Total counts across all group types
  const totalAllGroups = totalDriverGroups + totalMotoboyGroups + totalMerchantGroups;
  const totalActiveGroups = activeDriverGroups + activeMotoboyGroups + activeMerchantGroups;

  // Commission is based on TOTAL ACTIVE groups (driver + motoboy + merchant)
  const commissionRate = override?.custom_rate ?? calculateCommissionRate(totalActiveGroups);

  // Get available profiles and roles
  const availableProfiles = (profile.available_profiles as string[]) || [];
  const roles = userRoles?.map(r => r.role) || [];

  return {
    data: {
      profile: profile as UserProfile,
      groups: legacyGroups as WhatsAppGroup[],
      driverGroups: driverGroups,
      motoboyGroups: motoboyGroups,
      merchantGroups: merchantGroups,
      override: override as CommissionOverride | null,
      groupCount: legacyGroupCount,
      totalDriverGroups,
      activeDriverGroups,
      totalMotoboyGroups,
      activeMotoboyGroups,
      totalMerchantGroups,
      activeMerchantGroups,
      totalAllGroups,
      totalActiveGroups,
      commissionRate,
      availableProfiles,
      isAdmin: roles.includes('admin'),
      driverProfile: driverProfile || null,
      availableCredits: 0, // Fallback
      creditHistory: [] as any[],
    },
    error: null
  };

  // Add credit info if user is advertiser
  const { data: advertiserAccount } = await supabase
    .from('advertiser_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (advertiserAccount) {
    const { data: balanceData } = await supabase
      .from('advertiser_credit_balances')
      .select('available_credits')
      .eq('advertiser_account_id', advertiserAccount.id)
      .maybeSingle();

    const { data: ledgerData } = await supabase
      .from('advertiser_credit_ledger')
      .select('*')
      .eq('advertiser_account_id', advertiserAccount.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (result.data) {
      result.data.availableCredits = balanceData?.available_credits ?? 0;
      result.data.creditHistory = ledgerData || [];
    }
  }

  return result;
}

// Get global sandbox statistics
export async function getGlobalSandboxStats() {
  const { data, error } = await supabase
    .from('advertiser_credit_balances')
    .select('available_credits');

  if (error) return { totalCredits: 0, error };

  const total = (data || []).reduce((sum, row) => sum + row.available_credits, 0);
  return { totalCredits: total, error: null };
}

// Update user active status
export async function updateUserActiveStatus(userId: string, isActive: boolean) {
  const { error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);

  return { error };
}

// Set commission override
export async function setCommissionOverride(userId: string, customRate: number, adminId: string) {
  const { data, error } = await supabase
    .from('commission_overrides')
    .upsert({
      user_id: userId,
      custom_rate: customRate,
      set_by_admin: adminId
    }, { onConflict: 'user_id' })
    .select()
    .single();

  return { data, error };
}

// Remove commission override
export async function removeCommissionOverride(userId: string) {
  const { error } = await supabase
    .from('commission_overrides')
    .delete()
    .eq('user_id', userId);

  return { error };
}

// Update driver whatsapp group status (admin action)
export async function updateDriverGroupStatus(groupId: string, status: 'ativo' | 'rejeitado' | 'inativo') {
  const { data, error } = await supabase
    .from('driver_whatsapp_groups')
    .update({ status })
    .eq('id', groupId)
    .select()
    .single();

  return { data: data as DriverWhatsAppGroup | null, error };
}

// Get platform statistics
export async function getPlatformStats() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id');

  const { data: groups } = await supabase
    .from('whatsapp_groups')
    .select('user_id');

  const totalUsers = profiles?.length || 0;
  const totalGroups = groups?.length || 0;

  // Calculate users by group count
  const groupCountByUser = new Map<string, number>();
  groups?.forEach(g => {
    groupCountByUser.set(g.user_id, (groupCountByUser.get(g.user_id) || 0) + 1);
  });

  let usersWithZeroGroups = 0;
  let usersWithThreePlusGroups = 0;

  profiles?.forEach(p => {
    const count = groupCountByUser.get(p.id) || 0;
    if (count === 0) usersWithZeroGroups++;
    if (count >= 3) usersWithThreePlusGroups++;
  });

  return {
    totalUsers,
    totalGroups,
    usersWithZeroGroups,
    usersWithThreePlusGroups
  };
}
