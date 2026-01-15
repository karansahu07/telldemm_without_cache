import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { webcrypto } from 'crypto';

const { subtle } = webcrypto;

admin.initializeApp();

/**
 * AES Decrypt (same logic as frontend service)
 */
const secretKey = 'YourSuperSecretPassphrase';
let aesKey: CryptoKey | null = null;

// derive AES key
async function importAESKey(passphrase: string): Promise<void> {
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  aesKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('your_salt_value'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decryptText(cipherText: string): Promise<string> {
  if (!aesKey) {
    await importAESKey(secretKey);
  }

  if (!cipherText) return '';

  try {
    const data = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));

    if (data.length <= 12) {
      return cipherText; // fallback (maybe plain text)
    }

    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);

    const decrypted = await subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey!,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error('❌ Decryption failed:', err);
    return cipherText;
  }
}

// ========================================
// 🔕 NEW: CHECK IF CHAT IS MUTED
// ========================================
/**
 * Check if a specific roomId is in the user's mutedChats list
 * @param userId - The user ID to check
 * @param roomId - The room ID to check
 * @returns Promise<boolean> - True if chat is muted
 */
async function isChatMuted(userId: string, roomId: string): Promise<boolean> {
  try {
    const mutedChatsSnapshot = await admin
      .database()
      .ref(`/users/${userId}/mutedChats`)
      .once('value');

    const mutedChats = mutedChatsSnapshot.val();

    // If no muted chats array, chat is not muted
    if (!mutedChats || !Array.isArray(mutedChats)) {
      return false;
    }

    // Check if roomId exists in muted chats array
    const isMuted = mutedChats.includes(roomId);
    
    if (isMuted) {
      console.log(`🔕 Chat ${roomId} is muted for user ${userId}`);
    }

    return isMuted;
  } catch (error) {
    console.error('❌ Error checking mute status:', error);
    return false; // Default to not muted if error occurs
  }
}

// 🔥 UNIFIED NOTIFICATION FUNCTION (Private + Group)
export const sendNotificationOnNewMessage = functions.database
  .ref('/chats/{roomId}/{messageId}')
  .onCreate(
    async (
      snapshot: functions.database.DataSnapshot,
      context: functions.EventContext
    ) => {
      const messageData = snapshot.val();
      const roomId = context.params.roomId;
      const messageId = context.params.messageId;

      try {
        // ✅ Check if this is a group chat
        const isGroupChat = roomId.startsWith('group_');

        if (isGroupChat) {
          console.log('👥 Group chat message detected:', { roomId, messageId });
          await handleGroupNotification(messageData, roomId, messageId);
        } else {
          console.log('📱 Private chat message detected:', {
            roomId,
            messageId,
          });
          await handlePrivateNotification(messageData, roomId, messageId);
        }
      } catch (error) {
        console.error('❌ Error in notification function:', error);
      }
    }
  );

// 📱 Private Chat Notification Handler
async function handlePrivateNotification(
  messageData: any,
  roomId: string,
  messageId: string
) {
  console.log('message Data is', messageData);
  try {
    // 🔥 NEW: Check if receiver has muted this chat
    const isMuted = await isChatMuted(messageData.receiver_id, roomId);
    
    if (isMuted) {
      console.log(
        `🔕 Chat ${roomId} is muted by receiver ${messageData.receiver_id}, notification skipped`
      );
      return;
    }

    // 🔥 Check isPermission
    const permissionSnapshot = await admin
      .database()
      .ref(`/users/${messageData.receiver_id}/isPermission`)
      .once('value');

    const isPermission = permissionSnapshot.val();
    console.log({isPermission})

    // ✅ If permission is false, skip notification
    if (isPermission === false) {
      console.log(
        `🚫 Notification permission disabled for receiver: ${messageData.receiver_id}`
      );
      return;
    }

    // ✅ Get receiver FCM token
    const receiverTokenSnapshot = await admin
      .database()
      .ref(`/users/${messageData.receiver_id}/fcmToken`)
      .once('value');

    const receiverToken = receiverTokenSnapshot.val();

    if (!receiverToken) {
      console.log('Receiver FCM token not found for:', messageData.receiver_id);
      return;
    }

    // ✅ Avoid self notification
    if (messageData.sender === messageData.receiver_id) {
      console.log('Self message, notification not sent');
      return;
    }

    // 🔥 Check if receiver has sender's chat screen open
    const activeChatSnapshot = await admin
      .database()
      .ref(`/activeChats/${messageData.receiver_id}`)
      .once('value');

    const activeChatId = activeChatSnapshot.val();

    if (activeChatId) {
      // Split the chatId (format: "76_78")
      const participants = String(activeChatId).split('_');

      // Check if sender ID is in the participants
      if (participants.includes(String(messageData.sender))) {
        console.log(
          `Receiver ${messageData.receiver_id} is currently chatting with sender ${messageData.sender}, notification not sent`
        );
        return;
      }
    }

    // ✅ Prepare message body
    let messageBody = 'New message';

    if (messageData.text) {
      // 🔑 Decrypt text before sending notification
      messageBody = await decryptText(messageData.text);
    }

    if (messageData.attachment) {
      switch (messageData.attachment.type) {
        case 'image':
          messageBody = '📷 Image';
          break;
        case 'video':
          messageBody = '🎥 Video';
          break;
        case 'audio':
          messageBody = '🎵 Audio';
          break;
        case 'document':
          messageBody = '📄 Document';
          break;
        default:
          messageBody = '📎 Attachment';
      }
    }

    // ✅ Send notification with TAG
    const response = await admin.messaging().send({
      token: receiverToken,
      notification: {
        title: messageData.sender_phone || 'New Message',
        body: messageBody,
      },
      android: {
        notification: {
          sound: 'default',
          channelId: 'default',
          icon: 'ic_launcher',
          tag: `${roomId}`,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
      data: {
        payload: JSON.stringify({
          roomId: String(roomId),
          senderId: String(messageData.sender),
          senderPhone: String(messageData.sender_phone),
          receiverId: String(messageData.receiver_id),
          messageId: String(messageId),
          notificationId: String(messageId),
          chatType: 'private',
          timestamp: String(messageData.timestamp),
          route: `/chatting-screen?receiverId=${messageData.receiver_id}`,
        }),
      },
    });

    console.log('✅ Private notification sent successfully:', response);
    console.log(`📌 Notification tag set to: ${roomId}`);
  } catch (error) {
    console.error('❌ Error sending private notification:', error);
  }
}

// 👥 Group Chat Notification Handler - UPDATED WITH MUTE CHECK
async function handleGroupNotification(
  messageData: any,
  roomId: string,
  messageId: string
) {
  try {
    const groupId = roomId; // roomId = group_12345

    // ✅ Fetch group root (for title, createdBy, adminIds, etc.)
    const groupSnapshot = await admin
      .database()
      .ref(`/groups/${groupId}`)
      .once('value');

    const groupData = groupSnapshot.val();
    if (!groupData) {
      console.log('❌ Group not found:', groupId);
      return;
    }

    // 🔥 **Fetch members ONLY from /groups/groupId/members**
    const membersSnapshot = await admin
      .database()
      .ref(`/groups/${groupId}/members`)
      .once('value');

    const members = membersSnapshot.val() || {};

    // 🔥 Exclude sender from member list
    const memberIds = Object.keys(members).filter(
      (memberId) => memberId !== messageData.sender
    );

    if (memberIds.length === 0) {
      console.log('📭 No members to notify in group:', groupId);
      return;
    }

    console.log(`🔍 Members to notify: ${JSON.stringify(memberIds)}`);

    // ✅ Get FCM tokens for group members + check active chats + isPermission + mute status
    const memberTokens: Array<{ memberId: string; token: string }> = [];

    const tokenPromises = memberIds.map(async (memberId) => {
      try {
        // 🔥 NEW: Check if member has muted this group chat
        const isMuted = await isChatMuted(memberId, groupId);
        
        if (isMuted) {
          console.log(
            `🔕 Group ${groupId} is muted by member ${memberId}, skipping notification`
          );
          return;
        }

        // 🔥 Check isPermission
        const permissionSnapshot = await admin
          .database()
          .ref(`/users/${memberId}/isPermission`)
          .once('value');

        const isPermission = permissionSnapshot.val();

        // ✅ If permission is false, skip this member
        if (isPermission === false) {
          console.log(
            `🚫 Notification permission disabled for member: ${memberId}`
          );
          return;
        }

        // 🔥 Check if this member has the group chat open
        const activeChatSnapshot = await admin
          .database()
          .ref(`/activeChats/${memberId}`)
          .once('value');

        const activeChatId = activeChatSnapshot.val();

        // If member has this group open, skip notification
        if (activeChatId === groupId) {
          console.log(
            `⏭️ Member ${memberId} is currently in group ${groupId}, skipping notification`
          );
          return;
        }

        // Get FCM token
        const tokenSnapshot = await admin
          .database()
          .ref(`/users/${memberId}/fcmToken`)
          .once('value');

        const token = tokenSnapshot.val();
        if (token) {
          memberTokens.push({ memberId, token });
        } else {
          console.log(`⚠️ Member has no token: ${memberId}`);
        }
      } catch (err) {
        console.error(`❌ Error fetching token for ${memberId}:`, err);
      }
    });

    await Promise.all(tokenPromises);

    if (memberTokens.length === 0) {
      console.log(
        '📭 No valid FCM tokens found for group (permissions disabled, muted, or all members have chat open)'
      );
      return;
    }

    // 🎯 Build notification body
    const groupName = groupData.title || 'Group Chat';
    const senderPhone = messageData.sender_phone || 'Someone';

    let messageBody = 'New message';

    if (messageData.text) {
      const decrypted = await decryptText(messageData.text);
      messageBody =
        decrypted.length > 60 ? decrypted.substring(0, 60) + '…' : decrypted;
    }

    if (messageData.attachment) {
      switch (messageData.attachment.type) {
        case 'image':
          messageBody = '📷 sent an image';
          break;
        case 'video':
          messageBody = '🎥 sent a video';
          break;
        case 'audio':
          messageBody = '🎵 sent an audio';
          break;
        case 'document':
          messageBody = '📄 sent a document';
          break;
        default:
          messageBody = '📎 sent an attachment';
      }
    }

    // 🚀 Send notifications individually with TAG
    const sendTasks = memberTokens.map(async ({ memberId, token }) => {
      try {
        await admin.messaging().send({
          token,
          notification: {
            title: `${senderPhone} in ${groupName}`,
            body: messageBody,
          },
          android: {
            notification: {
              sound: 'default',
              clickAction: 'FCM_PLUGIN_ACTIVITY',
              icon: 'ic_launcher',
              tag: `${groupId}`,
            },
          },
          data: {
            payload: JSON.stringify({
              roomId: String(groupId),
              senderId: String(messageData.sender),
              senderPhone: String(messageData.sender_phone),
              messageId: String(messageId),
              notificationId: String(messageId),
              chatType: 'group',
              groupName: String(groupName),
              timestamp: String(messageData.timestamp),
            }),
          },
        });

        console.log(`✅ Notification sent to member ${memberId}`);
        console.log(`📌 Group notification tag set to: ${groupId}`);
      } catch (err: any) {
        console.error(`❌ Failed sending to member ${memberId}:`, err.message);
      }
    });

    await Promise.all(sendTasks);

    // Mark as notified
    await admin
      .database()
      .ref(`/chats/${groupId}/${messageId}/notified`)
      .set(true);

    console.log('🎉 Group notifications completed.');
  } catch (error) {
    console.error('❌ Error sending group notification:', error);
  }
}