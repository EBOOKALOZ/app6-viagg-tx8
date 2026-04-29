import { supabase } from "@/integrations/supabase/client";

export interface MediaItem {
  id: string;
  title: string;
  description: string | null;
  media_type: 'image' | 'video';
  media_url: string;
  tags: string[];
  status: 'ativo' | 'pausado';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  priority: number | null;
  max_daily_usage: number | null;
  min_days_between_same_group: number | null;
  campaign_type: string | null;
  is_active: boolean | null;
  total_usage: number | null;
  last_used_at: string | null;
}

export interface MessageLibraryItem {
  id: string;
  title: string;
  body: string;
  category: string | null;
  priority: number | null;
  allow_link: boolean | null;
  min_days_between_same_group: number | null;
  is_active: boolean | null;
  created_at: string;
  total_usage: number | null;
  last_used_at: string | null;
}

export interface PostingMessage {
  id: string;
  title: string;
  content: string;
  tags: string[];
  status: 'ativo' | 'pausado';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupPostingSettings {
  id: string;
  group_id: string;
  group_type: 'driver' | 'motoboy';
  posting_interval_days: number;
  last_posted_at: string | null;
  next_allowed_at: string | null;
  last_media_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostingHistory {
  id: string;
  group_id: string;
  group_type: 'driver' | 'motoboy';
  media_id: string | null;
  message: string | null;
  status: 'postado' | 'erro' | 'bloqueado';
  error_message: string | null;
  posted_by: string | null;
  posted_at: string;
}

export interface GroupWithPostingInfo {
  id: string;
  link: string;
  estado: string;
  cidade: string;
  tipo: string;
  status: string;
  user_id: string;
  group_type: 'driver' | 'motoboy';
  posting_settings: GroupPostingSettings | null;
  can_post: boolean;
  days_until_allowed: number | null;
  next_allowed_at: Date | null;
  last_posted_at: Date | null;
  interval_days: number;
}

// Media Library Functions
export async function getMediaLibrary(): Promise<MediaItem[]> {
  const { data, error } = await supabase
    .from('media_library')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as MediaItem[];
}

export async function getActiveMedia(): Promise<MediaItem[]> {
  const { data, error } = await supabase
    .from('media_library')
    .select('*')
    .eq('status', 'ativo')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as MediaItem[];
}

export async function createMedia(
  title: string,
  media_type: 'image' | 'video',
  media_url: string,
  tags: string[],
  description?: string
): Promise<MediaItem> {
  const { data: userData } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('media_library')
    .insert({
      title,
      media_type,
      media_url,
      tags,
      description,
      created_by: userData.user?.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MediaItem;
}

export async function updateMediaStatus(id: string, status: 'ativo' | 'pausado'): Promise<void> {
  const { error } = await supabase
    .from('media_library')
    .update({ status })
    .eq('id', id);

  if (error) throw error;
}

export async function updateMediaFields(id: string, fields: {
  priority?: number;
  max_daily_usage?: number;
  min_days_between_same_group?: number;
  campaign_type?: string;
  is_active?: boolean;
  title?: string;
  description?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('media_library')
    .update(fields as any)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteMedia(id: string): Promise<void> {
  const { error } = await supabase
    .from('media_library')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Message Library Functions
export async function getMessageLibrary(): Promise<MessageLibraryItem[]> {
  const { data, error } = await supabase
    .from('message_library' as any)
    .select('*')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .order('priority', { ascending: true });

  if (error) throw error;
  return data as any as MessageLibraryItem[];
}

export async function createMessageLibraryItem(
  title: string,
  body: string,
  category?: string,
  priority?: number
): Promise<MessageLibraryItem> {
  const { data, error } = await supabase
    .from('message_library' as any)
    .insert({ title, body, category, priority } as any)
    .select()
    .single();

  if (error) throw error;
  return data as any as MessageLibraryItem;
}

export async function updateMessageLibraryItem(id: string, fields: {
  title?: string;
  body?: string;
  priority?: number;
  allow_link?: boolean;
  min_days_between_same_group?: number;
  is_active?: boolean;
  category?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('message_library' as any)
    .update(fields as any)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteMessageLibraryItem(id: string): Promise<void> {
  // Soft-delete: only cancel pending messages
  const { error } = await supabase
    .from('message_library' as any)
    .update({ status: 'cancelled', deleted_at: new Date().toISOString() } as any)
    .eq('id', id)
    .eq('status', 'pending');

  if (error) throw error;
}

// Posting Messages Functions
export async function getPostingMessages(): Promise<PostingMessage[]> {
  const { data, error } = await supabase
    .from('posting_messages')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as PostingMessage[];
}

export async function getActiveMessages(): Promise<PostingMessage[]> {
  const { data, error } = await supabase
    .from('posting_messages')
    .select('*')
    .eq('status', 'ativo')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as PostingMessage[];
}

export async function createMessage(
  title: string,
  content: string,
  tags: string[]
): Promise<PostingMessage> {
  const { data: userData } = await supabase.auth.getUser();
  
  const { data, error } = await supabase
    .from('posting_messages')
    .insert({
      title,
      content,
      tags,
      created_by: userData.user?.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as PostingMessage;
}

export async function updateMessageStatus(id: string, status: 'ativo' | 'pausado'): Promise<void> {
  const { error } = await supabase
    .from('posting_messages')
    .update({ status })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase
    .from('posting_messages')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// Groups with Posting Info Functions - with smart sorting
export async function getGroupsWithPostingInfo(): Promise<GroupWithPostingInfo[]> {
  const DEFAULT_INTERVAL = 6;
  
  // Get driver groups
  const { data: driverGroups, error: driverError } = await supabase
    .from('driver_whatsapp_groups')
    .select('*')
    .eq('status', 'ativo');

  if (driverError) throw driverError;

  // Get motoboy groups
  const { data: motoboyGroups, error: motoboyError } = await supabase
    .from('motoboy_whatsapp_groups')
    .select('*')
    .eq('status', 'ativo');

  if (motoboyError) throw motoboyError;

  // Get posting settings
  const { data: settings, error: settingsError } = await supabase
    .from('group_posting_settings')
    .select('*');

  if (settingsError) throw settingsError;

  const now = new Date();
  const groups: GroupWithPostingInfo[] = [];

  // Process driver groups
  for (const group of driverGroups || []) {
    const setting = settings?.find(
      (s) => s.group_id === group.id && s.group_type === 'driver'
    ) as GroupPostingSettings | undefined;

    let canPost = true;
    let daysUntilAllowed: number | null = null;
    let nextAllowedAt: Date | null = null;
    const lastPostedAt: Date | null = setting?.last_posted_at ? new Date(setting.last_posted_at) : null;
    const intervalDays = setting?.posting_interval_days || DEFAULT_INTERVAL;

    if (setting?.next_allowed_at) {
      nextAllowedAt = new Date(setting.next_allowed_at);
      if (nextAllowedAt > now) {
        canPost = false;
        daysUntilAllowed = Math.ceil(
          (nextAllowedAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
    }

    groups.push({
      id: group.id,
      link: group.link,
      estado: group.estado,
      cidade: group.cidade,
      tipo: group.tipo,
      status: group.status,
      user_id: group.user_id,
      group_type: 'driver',
      posting_settings: setting || null,
      can_post: canPost,
      days_until_allowed: daysUntilAllowed,
      next_allowed_at: nextAllowedAt,
      last_posted_at: lastPostedAt,
      interval_days: intervalDays,
    });
  }

  // Process motoboy groups
  for (const group of motoboyGroups || []) {
    const setting = settings?.find(
      (s) => s.group_id === group.id && s.group_type === 'motoboy'
    ) as GroupPostingSettings | undefined;

    let canPost = true;
    let daysUntilAllowed: number | null = null;
    let nextAllowedAt: Date | null = null;
    const lastPostedAt: Date | null = setting?.last_posted_at ? new Date(setting.last_posted_at) : null;
    const intervalDays = setting?.posting_interval_days || DEFAULT_INTERVAL;

    if (setting?.next_allowed_at) {
      nextAllowedAt = new Date(setting.next_allowed_at);
      if (nextAllowedAt > now) {
        canPost = false;
        daysUntilAllowed = Math.ceil(
          (nextAllowedAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
      }
    }

    groups.push({
      id: group.id,
      link: group.link,
      estado: group.estado,
      cidade: group.cidade,
      tipo: group.tipo,
      status: group.status,
      user_id: group.user_id,
      group_type: 'motoboy',
      posting_settings: setting || null,
      can_post: canPost,
      days_until_allowed: daysUntilAllowed,
      next_allowed_at: nextAllowedAt,
      last_posted_at: lastPostedAt,
      interval_days: intervalDays,
    });
  }

  // Smart sorting: available first (by oldest last_posted_at), then blocked
  return groups.sort((a, b) => {
    // First, sort by can_post (available groups first)
    if (a.can_post !== b.can_post) {
      return a.can_post ? -1 : 1;
    }

    // For available groups, sort by last_posted_at (oldest first, nulls first)
    if (a.can_post && b.can_post) {
      if (a.last_posted_at === null && b.last_posted_at === null) return 0;
      if (a.last_posted_at === null) return -1;
      if (b.last_posted_at === null) return 1;
      return a.last_posted_at.getTime() - b.last_posted_at.getTime();
    }

    // For blocked groups, sort by next_allowed_at (soonest first)
    if (!a.can_post && !b.can_post) {
      if (a.next_allowed_at === null && b.next_allowed_at === null) return 0;
      if (a.next_allowed_at === null) return 1;
      if (b.next_allowed_at === null) return -1;
      return a.next_allowed_at.getTime() - b.next_allowed_at.getTime();
    }

    return 0;
  });
}

// Posting Functions
export async function recordPosting(
  groupId: string,
  groupType: 'driver' | 'motoboy',
  mediaId: string | null,
  message: string | null,
  status: 'postado' | 'erro' | 'bloqueado',
  errorMessage?: string
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();

  // Record in history
  const { error: historyError } = await supabase
    .from('posting_history')
    .insert({
      group_id: groupId,
      group_type: groupType,
      media_id: mediaId,
      message,
      status,
      error_message: errorMessage,
      posted_by: userData.user?.id,
    });

  if (historyError) throw historyError;

  // Update posting settings if successful
  if (status === 'postado') {
    const now = new Date();
    const intervalDays = 6; // Default interval

    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('group_posting_settings')
      .select('*')
      .eq('group_id', groupId)
      .eq('group_type', groupType)
      .single();

    const nextAllowed = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    if (existingSettings) {
      const { error: updateError } = await supabase
        .from('group_posting_settings')
        .update({
          last_posted_at: now.toISOString(),
          next_allowed_at: nextAllowed.toISOString(),
          last_media_id: mediaId,
        })
        .eq('id', existingSettings.id);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('group_posting_settings')
        .insert({
          group_id: groupId,
          group_type: groupType,
          posting_interval_days: intervalDays,
          last_posted_at: now.toISOString(),
          next_allowed_at: nextAllowed.toISOString(),
          last_media_id: mediaId,
        });

      if (insertError) throw insertError;
    }
  }
}

// History Functions
export async function getPostingHistory(limit = 50): Promise<PostingHistory[]> {
  const { data, error } = await supabase
    .from('posting_history')
    .select('*')
    .order('posted_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as PostingHistory[];
}

export async function getGroupPostingHistory(
  groupId: string,
  groupType: 'driver' | 'motoboy'
): Promise<PostingHistory[]> {
  const { data, error } = await supabase
    .from('posting_history')
    .select('*')
    .eq('group_id', groupId)
    .eq('group_type', groupType)
    .order('posted_at', { ascending: false });

  if (error) throw error;
  return data as PostingHistory[];
}

// Settings Functions
export async function updateGroupInterval(
  groupId: string,
  groupType: 'driver' | 'motoboy',
  intervalDays: number
): Promise<void> {
  const { data: existing } = await supabase
    .from('group_posting_settings')
    .select('*')
    .eq('group_id', groupId)
    .eq('group_type', groupType)
    .single();

  if (existing) {
    const { error } = await supabase
      .from('group_posting_settings')
      .update({ posting_interval_days: intervalDays })
      .eq('id', existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('group_posting_settings')
      .insert({
        group_id: groupId,
        group_type: groupType,
        posting_interval_days: intervalDays,
      });

    if (error) throw error;
  }
}

// Upload media file
export async function uploadMediaFile(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('viagg-campaign-media-mensage')
    .upload(filePath, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('viagg-campaign-media-mensage')
    .getPublicUrl(filePath);

  return urlData.publicUrl;
}