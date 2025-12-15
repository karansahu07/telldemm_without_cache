import { IMessage } from 'src/app/services/sqlite.service';

export interface Message {
  msgId: string;
  sender_id: string;
  key?: any;
  text: string | null;
  timestamp: string;
  sender_phone: string;
  sender_name: string;
  receiver_id: string;
  receiver_phone: string;
  receiver_name?: string;

  delivered: boolean;
  deliveredAt?: number | '';

  read: boolean;
  readAt?: number | '';

  isDeleted?: boolean; // optional placeholder flag (true = message is replaced with "deleted" placeholder)
  message_id: string;
  isEdit?: boolean;
  time?: string;
  type?: string;
  isForwarded?: boolean;
  fadeOut?: boolean;

  // attachment unchanged:
  attachment?: {
    type: 'image' | 'video' | 'audio' | 'file';
    fileName?: string;
    mimeType?: string;
    base64Data?: string;
    mediaId?: string;
    fileSize?: number;
    filePath?: string;
    caption?: string;
    previewUrl?: string | null;
    localUrl? : string;
    cdnUrl? : string;
  };

  replyToMessageId?: string | undefined;
  reactions?: { [userId: string]: string };

  // --------------- NEW FIELDS FOR DELETION ---------------
  /**
   * Per-user deletion marker. If deletedFor[currentUserId] === true
   * then current user must NOT see this message.
   */
  deletedFor?: { [userId: string]: boolean };

  /**
   * Convenience flag for "deleted for everyone".
   * If true => message is deleted for everyone.
   */
  deletedForEveryone?: boolean;

  /**
   * Who performed delete-for-everyone action (userId).
   */
  deletedBy?: string | null;

  /**
   * Timestamp (ms) when deletion was performed.
   */
  deletedAt?: number | null;
  // -------------------------------------------------------
}

export interface PinnedMessage {
  roomId: string;
  // key: string; // Chat room ID (1-to-1, group, community)
  messageId?: string; // ID of the pinned message
  pinnedBy: string; // User who pinned the message
  pinnedAt: number; // Timestamp when the message was pinned
  scope: 'global'; // Always global
}

export interface PinnedMessagesCollection {
  [key: string]: PinnedMessage;
}
export interface PinnedMessageWithContent extends PinnedMessage {
  messageContent?: Message; // Assuming you have a ChatMessage interface
}

export interface Contact {
  userId: number;
  name: string;
  profile: string | null;
  // phone?: string;
  // lastMessage?: string | null;
}

export interface CropResult {
  success: boolean;
  croppedImage?: string;
  originalBlob?: Blob;
  cropArea?: any;
  error?: string;
  cancelled?: boolean;
}

export interface TypingEntry {
  userId: string;
  typing?: boolean;
  lastUpdated?: number;
}

export interface SocialMediaEntry {
  user_social_id: number;
  profile_url: string;
  platform: string;
}

export interface GetSocialMediaResponse {
  success: boolean;
  data: SocialMediaEntry[];
}

export interface GroupChat {
  name: string;
  receiver_Id: string; // groupId
  group: true;
  isCommunity?: boolean;
  group_name?: string;
  message: string;
  time: string;
  unread: boolean;
  unreadCount: number;
  dp: string | null;
  isTyping: boolean;
  typingText: string | null;
  typingCount: number;
  members: Record<string, any>;
  pinned?: boolean | null;
  pinnedAt?: number | null;
  timestamp?: string | number | null;
}

export interface GroupMember {
  user_id: string;
  name?: string;
  phone_number?: string;
  avatar?: string;
  publicKeyHex?: string | null;
  status?: 'active' | 'left' | 'removed';
  role?: 'admin' | 'member';
  [k: string]: any;
}

export interface GroupData {
  name: string;
  groupId: string;
  description?: string;
  createdBy: string;
  createdByName?: string;
  createdAt?: string | number;
  members: Record<string, Partial<GroupMember>>;
}

export interface Community {
  name: string;
  description?: string;
  createdBy: string;
  groups?: Record<string, boolean> | {};
}

export interface CreateCommunityPayload {
  community_name: string;
  description?: string;
  community_dp?: string;
  is_public?: boolean;
  max_members?: number;
  can_edit_dp?: boolean;
  can_add_members?: boolean;
  can_add_groups?: boolean;
  creatorId: number;
  firebase_community_id?: string;
}

export interface CreateCommunityResponse {
  status: boolean;
  message?: string;
  data?: any;
}

// Community row type for Home chat list
export interface CommunityChat {
  name: string;
  receiver_Id: string; // community id
  group: true; // visually treated like a group
  isCommunity: true; // special flag for UI/navigation
  group_name?: string; // preview group name (announcement/general/first)
  message: string; // preview text
  time: string; // preview time (formatted)
  unread: boolean;
  unreadCount: number;
  dp: string | null; // community icon
  pinned?: boolean | null;
  pinnedAt?: number | null;
  timestamp?: string | number | null;
}

export type ArchItem = {
  roomId: string;
  isGroup: boolean;
  otherUserId?: string;
  name: string;
  avatar?: string | null;
  message: string;
  time: string;
  timestamp?: string;
  unreadCount: number;
};

export interface IDeviceContact {
  name: string;
  phoneNumber: string;
}

export interface IUser {
  user_id: number;
  name: string;
  phone_number: string;
  email: string | null;
  profile_picture_url: string | null;
  status: 'verified' | 'unverified' | string;
  user_created_at: string | null;
  otp_id: number | null;
  otp_code: string | null;
  is_verified: boolean | null;
  otp_created_at: string | null;
  expires_at: string | null;
  bio?: any;
}

export interface IChat extends IUser {
  dp: any;
  pinnedAt?: number | null;
  pinned?: null | number | unknown;
  name: string; // overrides IUser name if needed
  receiver_Id: number | string;
  profile_picture_url: string | null;
  receiver_phone: string;
  group: boolean;
  message: string;
  time: string;
  unreadCount: number;
  unread: boolean;
  isTyping: boolean;
  typingText: string | null;
  typingCount: number;
  isCommunity?: boolean;
  members?: any;
}



export interface IChatMeta {
  type: 'private' | 'group' | 'community';
  lastmessageAt: number | string | Date;
  lastmessageType: IMessage['type'];
  lastmessage: string;
  unreadCount: number | string;
  isArchived : boolean;
  isPinned : boolean;
  pinnedAt?: number | "";
  isLocked : boolean;
  removedOrLeftAt? : string;
}
