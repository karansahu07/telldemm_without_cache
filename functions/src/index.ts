// /**
//  * Import function triggers from their respective submodules:
//  *
//  * import {onCall} from "firebase-functions/v2/https";
//  * import {onDocumentWritten} from "firebase-functions/v2/firestore";
//  *
//  * See a full list of supported triggers at https://firebase.google.com/docs/functions
//  */

// import { setGlobalOptions } from "firebase-functions";
// // import {onRequest} from "firebase-functions/https";
// // import * as logger from "firebase-functions/logger";

// // Start writing functions
// // https://firebase.google.com/docs/functions/typescript

// // For cost control, you can set the maximum number of containers that can be
// // running at the same time. This helps mitigate the impact of unexpected
// // traffic spikes by instead downgrading performance. This limit is a
// // per-function limit. You can override the limit for each function using the
// // `maxInstances` option in the function's options, e.g.
// // `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// // NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// // functions should each use functions.runWith({ maxInstances: 10 }) instead.
// // In the v1 API, each function can only serve one request per container, so
// // this will be the maximum concurrent request count.
// setGlobalOptions({ maxInstances: 10 });

// // export const helloWorld = onRequest((request, response) => {
// //   logger.info("Hello logs!", {structuredData: true});
// //   response.send("Hello from Firebase!");
// // });


// // import * as functions from 'firebase-functions/v1';
// // import * as admin from 'firebase-admin';

// // admin.initializeApp();

// // export const sendNotificationOnNewMessage = functions.database
// //   .ref('/chats/{chatId}/messages/{messageId}')
// //   .onCreate(async (snapshot, context) => {
// //     const messageData = snapshot.val();
// //     const chatId = context.params.chatId;

// //     try {
// //       // Receiver ka FCM token get kariye
// //       const receiverTokenSnapshot = await admin.database()
// //         .ref(`/users/${messageData.receiverId}/fcmToken`)
// //         .once('value');

// //       const receiverToken = receiverTokenSnapshot.val();

// //       if (!receiverToken) {
// //         console.log('Receiver FCM token not found');
// //         return;
// //       }

// //       // Sender ka name get kariye
// //       const senderSnapshot = await admin.database()
// //         .ref(`/users/${messageData.senderId}/name`)
// //         .once('value');

// //       const senderName = senderSnapshot.val() || 'Unknown';

// //       // Notification payload
// //       const payload = {
// //         notification: {
// //           title: senderName,
// //           body: messageData.message,
// //           icon: 'assets/icon/favicon.ico',
// //           click_action: 'FCM_PLUGIN_ACTIVITY',
// //         },
// //         data: {
// //           chatId: chatId,
// //           senderId: messageData.senderId,
// //           messageId: context.params.messageId,
// //         },
// //       };

// //       // Send notification
// //       const response = await admin.messaging().sendToDevice(receiverToken, payload);
// //       console.log('Notification sent successfully:', response);

// //     } catch (error) {
// //       console.error('Error sending notification:', error);
// //     }
// //   });



// // import * as functions from 'firebase-functions/v1';
// // import * as admin from 'firebase-admin';
// // import { webcrypto } from 'crypto';

// // const { subtle } = webcrypto;

// // admin.initializeApp();

// // /**
// //  * AES Decrypt (same logic as frontend service)
// //  */
// // const secretKey = 'YourSuperSecretPassphrase';
// // let aesKey: CryptoKey | null = null;

// // // derive AES key
// // async function importAESKey(passphrase: string): Promise<void> {
// //   const enc = new TextEncoder();
// //   const keyMaterial = await subtle.importKey(
// //     'raw',
// //     enc.encode(passphrase),
// //     { name: 'PBKDF2' },
// //     false,
// //     ['deriveKey']
// //   );

// //   aesKey = await subtle.deriveKey(
// //     {
// //       name: 'PBKDF2',
// //       salt: enc.encode('your_salt_value'),
// //       iterations: 100000,
// //       hash: 'SHA-256'
// //     },
// //     keyMaterial,
// //     { name: 'AES-GCM', length: 256 },
// //     false,
// //     ['encrypt', 'decrypt']
// //   );
// // }

// // async function decryptText(cipherText: string): Promise<string> {
// //   if (!aesKey) {
// //     await importAESKey(secretKey);
// //   }

// //   if (!cipherText) return '';

// //   try {
// //     const data = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));

// //     if (data.length <= 12) {
// //       return cipherText; // fallback (maybe plain text)
// //     }

// //     const iv = data.slice(0, 12);
// //     const encrypted = data.slice(12);

// //     const decrypted = await subtle.decrypt(
// //       { name: 'AES-GCM', iv },
// //       aesKey!,
// //       encrypted
// //     );

// //     return new TextDecoder().decode(decrypted);
// //   } catch (err) {
// //     console.error('❌ Decryption failed:', err);
// //     return cipherText;
// //   }
// // }

// // export const sendNotificationOnNewMessage = functions.database
// //   .ref('/chats/{roomId}/{messageId}')
// //   .onCreate(async (snapshot: functions.database.DataSnapshot, context: functions.EventContext) => {
// //     const messageData = snapshot.val();
// //     const roomId = context.params.roomId;
// //     const messageId = context.params.messageId;

// //     try {
// //       // ✅ Get receiver FCM token
// //       const receiverTokenSnapshot = await admin.database()
// //         .ref(`/users/${messageData.receiver_id}/fcmToken`)
// //         .once('value');

// //       const receiverToken = receiverTokenSnapshot.val();

// //       if (!receiverToken) {
// //         console.log('Receiver FCM token not found for:', messageData.receiver_id);
// //         return;
// //       }

// //       // ✅ Avoid self notification
// //       if (messageData.sender_id === messageData.receiver_id) {
// //         console.log('Self message, notification not sent');
// //         return;
// //       }

// //       // ✅ Prepare message body
// //       let messageBody = 'New message';

// //       if (messageData.text) {
// //         // 🔑 Decrypt text before sending notification
// //         messageBody = await decryptText(messageData.text);
// //       }

// //       if (messageData.attachment) {
// //         switch (messageData.attachment.type) {
// //           case 'image': messageBody = '📷 Image'; break;
// //           case 'video': messageBody = '🎥 Video'; break;
// //           case 'audio': messageBody = '🎵 Audio'; break;
// //           case 'document': messageBody = '📄 Document'; break;
// //           default: messageBody = '📎 Attachment';
// //         }
// //       }

// //       // ✅ Send notification (new format)
// //       const response = await admin.messaging().send({
// //         token: receiverToken,
// //         notification: {
// //           title: messageData.sender_name || 'New Message',
// //           body: messageBody,
// //         },
// //         android: {
// //           notification: {
// //             sound: 'default',
// //             clickAction: 'FCM_PLUGIN_ACTIVITY',
// //             icon: 'assets/icon/favicon.ico',
// //           },
// //         },
// //         data: {
// //           roomId: roomId,
// //           senderId: messageData.sender_id,
// //           receiverId: messageData.receiver_id,
// //           messageId: messageId,
// //           chatType: 'private',
// //           timestamp: messageData.timestamp.toString()
// //         }
// //       });

// //       console.log('✅ Notification sent successfully:', response);

// //       // (Optional) delivered mark
// //       // await admin.database()
// //       //   .ref(`/chats/${roomId}/messages/${messageId}/delivered`)
// //       //   .set(true);

// //     } catch (error) {
// //       console.error('❌ Error sending notification:', error);
// //     }
// //   });




// import * as functions from 'firebase-functions/v1';
// import * as admin from 'firebase-admin';
// import { webcrypto } from 'crypto';

// const { subtle } = webcrypto;

// admin.initializeApp();

// /**
//  * AES Decrypt (same logic as frontend service)
//  */
// const secretKey = 'YourSuperSecretPassphrase';
// let aesKey: CryptoKey | null = null;

// // derive AES key
// async function importAESKey(passphrase: string): Promise<void> {
//   const enc = new TextEncoder();
//   const keyMaterial = await subtle.importKey(
//     'raw',
//     enc.encode(passphrase),
//     { name: 'PBKDF2' },
//     false,
//     ['deriveKey']
//   );

//   aesKey = await subtle.deriveKey(
//     {
//       name: 'PBKDF2',
//       salt: enc.encode('your_salt_value'),
//       iterations: 100000,
//       hash: 'SHA-256'
//     },
//     keyMaterial,
//     { name: 'AES-GCM', length: 256 },
//     false,
//     ['encrypt', 'decrypt']
//   );
// }

// async function decryptText(cipherText: string): Promise<string> {
//   if (!aesKey) {
//     await importAESKey(secretKey);
//   }

//   if (!cipherText) return '';

//   try {
//     const data = Uint8Array.from(atob(cipherText), c => c.charCodeAt(0));

//     if (data.length <= 12) {
//       return cipherText; // fallback (maybe plain text)
//     }

//     const iv = data.slice(0, 12);
//     const encrypted = data.slice(12);

//     const decrypted = await subtle.decrypt(
//       { name: 'AES-GCM', iv },
//       aesKey!,
//       encrypted
//     );

//     return new TextDecoder().decode(decrypted);
//   } catch (err) {
//     console.error('❌ Decryption failed:', err);
//     return cipherText;
//   }
// }

// // 🔥 UNIFIED NOTIFICATION FUNCTION (Private + Group)
// export const sendNotificationOnNewMessage = functions.database
//   .ref('/chats/{roomId}/{msgId}')
//   .onCreate(async (snapshot: functions.database.DataSnapshot, context: functions.EventContext) => {
//     const messageData = snapshot.val();
//     const roomId = context.params.roomId;
//     const messageId = context.params.messageId;

//     try {
//       // ✅ Check if this is a group chat
//       const isGroupChat = roomId.startsWith('group_');

//       if (isGroupChat) {
//         console.log('👥 Group chat message detected:', { roomId, messageId });
//         await handleGroupNotification(messageData, roomId, messageId);
//       } else {
//         console.log('📱 Private chat message detected:', { roomId, messageId });
//         await handlePrivateNotification(messageData, roomId, messageId);
//       }

//     } catch (error) {
//       console.error('❌ Error in notification function:', error);
//     }
//   });

// // 📱 Private Chat Notification Handler
// async function handlePrivateNotification(messageData: any, roomId: string, messageId: string) {
//   try {
//     // ✅ Get receiver FCM token
//     const receiverTokenSnapshot = await admin.database()
//       .ref(`/users/${messageData.receiver_id}/fcmToken`)
//       .once('value');

//     //  const roomParts = roomId.split('_');
//     // const receiver_id = roomParts.find((id) => id !== messageData.sender_id);

//     // if (!receiver_id) {
//     //   console.log('⚠️ Could not determine receiver_id from roomId:', roomId);
//     //   return;
//     // }

//     // // ✅ Get receiver FCM token
//     // const receiverTokenSnapshot = await admin.database()
//     //   .ref(`/users/${receiver_id}/fcmToken`)
//     //   .once('value');

//     const receiverToken = receiverTokenSnapshot.val();

//     if (!receiverToken) {
//       console.log('Receiver FCM token not found for:', messageData.receiver_id);
//       return;
//     }

//     // ✅ Avoid self notification
//     if (messageData.sender_id === messageData.receiver_id) {
//       console.log('Self message, notification not sent');
//       return;
//     }

//     // ✅ Prepare message body
//     let messageBody = 'New message';

//     if (messageData.text) {
//       // 🔑 Decrypt text before sending notification
//       messageBody = await decryptText(messageData.text);
//     }

//     if (messageData.attachment) {
//       switch (messageData.attachment.type) {
//         case 'image': messageBody = '📷 Image'; break;
//         case 'video': messageBody = '🎥 Video'; break;
//         case 'audio': messageBody = '🎵 Audio'; break;
//         case 'document': messageBody = '📄 Document'; break;
//         default: messageBody = '📎 Attachment';
//       }
//     }

//     // ✅ Send notification
//     const response = await admin.messaging().send({
//       token: receiverToken,
//       notification: {
//         title: messageData.sender_name || 'New Message',
//         body: messageBody,
//       },
//       android: {
//         notification: {
//           sound: 'default',
//           channelId: 'default',   // ✅ Make sure you create this channel in your app
//           icon: 'ic_launcher',    // ✅ Must be a valid resource name in Android (not path to .ico)
//         },
//       },
//       apns: {
//         payload: {
//           aps: {
//             sound: 'default',
//           },
//         },
//       },
//       data: {
//         roomId: roomId,
//         // senderId: messageData.sender_id,
//         // receiverId: messageData.receiver_id,
//          senderId: messageData.receiver_id,
//         receiverId: messageData.sender_id,
//         messageId: messageId,
//         chatType: 'private',
//         timestamp: messageData.timestamp.toString(),
//         route: `/chatting-screen?receiverId=${messageData.receiver_id}`,
//       },
//     });


//     console.log('✅ Private notification sent successfully:', response);

//   } catch (error) {
//     console.error('❌ Error sending private notification:', error);
//   }
// }

// // 👥 Group Chat Notification Handler
// async function handleGroupNotification(messageData: any, roomId: string, messageId: string) {
//   try {
//     // ✅ Get group details
//     const groupSnapshot = await admin.database()
//       .ref(`/groups/${roomId}`)
//       .once('value');

//     const groupData = groupSnapshot.val();
//     if (!groupData) {
//       console.log('❌ Group not found:', roomId);
//       return;
//     }

//     // ✅ Get all group members (excluding sender)
//     const members = groupData.members || {};
//     const memberIds = Object.keys(members).filter(memberId =>
//       memberId !== messageData.sender_id
//     );

//     if (memberIds.length === 0) {
//       console.log('📭 No members to notify in group:', roomId);
//       return;
//     }

//     // ✅ Get FCM tokens for all members
//     const memberTokens: string[] = [];
//     const tokenPromises = memberIds.map(async (memberId) => {
//       try {
//         const tokenSnapshot = await admin.database()
//           .ref(`/users/${memberId}/fcmToken`)
//           .once('value');

//         const token = tokenSnapshot.val();
//         if (token) {
//           memberTokens.push(token);
//           console.log(`✅ Token found for member: ${memberId}`);
//         } else {
//           console.log(`⚠️ No token for member: ${memberId}`);
//         }
//       } catch (error) {
//         console.error(`❌ Error getting token for member ${memberId}:`, error);
//       }
//     });

//     await Promise.all(tokenPromises);

//     if (memberTokens.length === 0) {
//       console.log('📭 No valid FCM tokens found for group members');
//       return;
//     }

//     // ✅ Prepare message content
//     let messageBody = 'New message';
//     const groupName = groupData.name || 'Group Chat';
//     const senderName = messageData.sender_name || 'Someone';

//     if (messageData.text) {
//       // 🔑 Decrypt text before sending notification
//       const decryptedText = await decryptText(messageData.text);
//       messageBody = decryptedText.length > 50
//         ? `${decryptedText.substring(0, 50)}...`
//         : decryptedText;
//     }

//     if (messageData.attachment) {
//       switch (messageData.attachment.type) {
//         case 'image': messageBody = '📷 sent an image'; break;
//         case 'video': messageBody = '🎥 sent a video'; break;
//         case 'audio': messageBody = '🎵 sent an audio'; break;
//         case 'document': messageBody = '📄 sent a document'; break;
//         default: messageBody = '📎 sent an attachment';
//       }
//     }

//     // ✅ Send notifications to all group members (individual sends instead of multicast)
//     const notificationResults = {
//       successCount: 0,
//       failureCount: 0,
//       responses: [] as any[]
//     };

//     // Send individual notifications to avoid multicast issues
//     const sendPromises = memberTokens.map(async (token) => {
//       try {
//         const message = {
//           token: token,
//           notification: {
//             title: `${senderName} in ${groupName}`,
//             body: messageBody,
//           },
//           android: {
//             notification: {
//               sound: 'default',
//               clickAction: 'FCM_PLUGIN_ACTIVITY',
//               icon: 'assets/icon/favicon.ico',
//               tag: roomId, // Group notifications with same tag will replace each other
//             },
//           },
//           data: {
//             roomId: roomId,
//             senderId: messageData.sender_id,
//             messageId: messageId,
//             chatType: 'group',
//             groupName: groupName,
//             timestamp: messageData.timestamp.toString()
//           }
//         };

//         const response = await admin.messaging().send(message);
//         notificationResults.successCount++;
//         notificationResults.responses.push({ success: true, messageId: response });
//         console.log(`✅ Group notification sent to token: ${token.substring(0, 10)}...`);

//       } catch (error: any) {
//         notificationResults.failureCount++;
//         notificationResults.responses.push({
//           success: false,
//           error: error,
//           token: token
//         });
//         console.error(`❌ Failed to send group notification to token ${token.substring(0, 10)}...:`, error.message);
//       }
//     });

//     await Promise.all(sendPromises);
//     const response = notificationResults;

//     console.log('✅ Group notifications sent:', {
//       successCount: response.successCount,
//       failureCount: response.failureCount,
//       totalTokens: memberTokens.length
//     });

//     // ✅ Handle failed tokens
//     if (response.failureCount > 0) {
//       const failedTokens: string[] = [];
//       response.responses.forEach((resp, idx) => {
//         if (!resp.success) {
//           const token = resp.token || memberTokens[idx];
//           console.error(`❌ Failed to send to token ${token?.substring(0, 10)}...:`, resp.error?.message);

//           // Track invalid tokens
//           if (resp.error?.code === 'messaging/registration-token-not-registered' ||
//             resp.error?.code === 'messaging/invalid-registration-token') {
//             failedTokens.push(token);
//           }
//         }
//       });

//       if (failedTokens.length > 0) {
//         console.log(`🧹 Found ${failedTokens.length} invalid tokens to clean up`);
//       }
//     }

//     // ✅ Update message notification status (optional)
//     await admin.database()
//       .ref(`/chats/${roomId}/${messageId}/notified`)
//       .set(true);

//   } catch (error) {
//     console.error('❌ Error sending group notification:', error);
//   }
// }


import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { webcrypto } from "crypto";
 
const { subtle } = webcrypto;
 
admin.initializeApp();
 
/**
* AES Decrypt (same logic as frontend service)
*/
const secretKey = "YourSuperSecretPassphrase";
let aesKey: CryptoKey | null = null;
 
// derive AES key
async function importAESKey(passphrase: string): Promise<void> {
  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
 
  aesKey = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("your_salt_value"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
 
async function decryptText(cipherText: string): Promise<string> {
  if (!aesKey) {
    await importAESKey(secretKey);
  }
 
  if (!cipherText) return "";
 
  try {
    const data = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));
 
    if (data.length <= 12) {
      return cipherText; // fallback (maybe plain text)
    }
 
    const iv = data.slice(0, 12);
    const encrypted = data.slice(12);
 
    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey!,
      encrypted
    );
 
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error("❌ Decryption failed:", err);
    return cipherText;
  }
}
 
// 🔥 UNIFIED NOTIFICATION FUNCTION (Private + Group)
export const sendNotificationOnNewMessage = functions.database
  .ref("/chats/{roomId}/{messageId}")
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
        const isGroupChat = roomId.startsWith("group_");
 
        if (isGroupChat) {
          console.log("👥 Group chat message detected:", { roomId, messageId });
          await handleGroupNotification(messageData, roomId, messageId);
        } else {
          console.log("📱 Private chat message detected:", {
            roomId,
            messageId,
          });
          await handlePrivateNotification(messageData, roomId, messageId);
        }
      } catch (error) {
        console.error("❌ Error in notification function:", error);
      }
    }
  );
 
// 📱 Private Chat Notification Handler
async function handlePrivateNotification(
  messageData: any,
  roomId: string,
  messageId: string
) {
  console.log("message Data is", messageData);
  try {
    // ✅ Get receiver FCM token
    const receiverTokenSnapshot = await admin
      .database()
      .ref(`/users/${messageData.receiver_id}/fcmToken`)
      .once("value");
 
    const receiverToken = receiverTokenSnapshot.val();
 
    if (!receiverToken) {
      console.log("Receiver FCM token not found for:", messageData.receiver_id);
      return;
    }
 
    // ✅ Avoid self notification
    if (messageData.sender === messageData.receiver_id) {
      console.log("Self message, notification not sent");
      return;
    }
 
    // ✅ Prepare message body
    let messageBody = "New message";
 
    if (messageData.text) {
      // 🔑 Decrypt text before sending notification
      messageBody = await decryptText(messageData.text);
    }
 
    if (messageData.attachment) {
      switch (messageData.attachment.type) {
        case "image":
          messageBody = "📷 Image";
          break;
        case "video":
          messageBody = "🎥 Video";
          break;
        case "audio":
          messageBody = "🎵 Audio";
          break;
        case "document":
          messageBody = "📄 Document";
          break;
        default:
          messageBody = "📎 Attachment";
      }
    }
 
    // ✅ Send notification - ALL DATA VALUES MUST BE STRINGS!
    const response = await admin.messaging().send({
      token: receiverToken,
      notification: {
        title: messageData.sender_name || "New Message",
        body: messageBody,
      },
      android: {
        notification: {
          sound: "default",
          channelId: "default",
          icon: "ic_launcher",
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },
      data: {
        payload: JSON.stringify({
          roomId: String(roomId),
          senderId: String(messageData.sender),
          receiverId: String(messageData.receiver_id),
          messageId: String(messageId),
          chatType: "private",
          timestamp: String(messageData.timestamp),
          route: `/chatting-screen?receiverId=${messageData.receiver_id}`,
        }),
      },
    });
 
    console.log("✅ Private notification sent successfully:", response);
  } catch (error) {
    console.error("❌ Error sending private notification:", error);
  }
}
 
// 👥 Group Chat Notification Handler - FIXED VERSION
async function handleGroupNotification(
  messageData: any,
  roomId: string,
  messageId: string
) {
  try {
    // ✅ Get group details
    const groupSnapshot = await admin
      .database()
      .ref(`/groups/${roomId}`)
      .once("value");
 
    const groupData = groupSnapshot.val();
    if (!groupData) {
      console.log("❌ Group not found:", roomId);
      return;
    }
 
    //exclude sender
    const members = groupData.members || {};
    const memberIds = Object.keys(members).filter(
      (memberId) => memberId !== messageData.sender
    );
 
    if (memberIds.length === 0) {
      console.log("📭 No members to notify in group:", roomId);
      return;
    }
 
    // ✅ Log sender info for debugging
    console.log(`🔍 Sender: ${messageData.sender}, Members to notify: ${memberIds.length}`);
 
    // ✅ Get FCM tokens for all members
    const memberTokens: string[] = [];
    const tokenPromises = memberIds.map(async (memberId) => {
      try {
        const tokenSnapshot = await admin
          .database()
          .ref(`/users/${memberId}/fcmToken`)
          .once("value");
 
        const token = tokenSnapshot.val();
        if (token) {
          memberTokens.push(token);
          console.log(`✅ Token found for member: ${memberId}`);
        } else {
          console.log(`⚠️ No token for member: ${memberId}`);
        }
      } catch (error) {
        console.error(`❌ Error getting token for member ${memberId}:`, error);
      }
    });
 
    await Promise.all(tokenPromises);
 
    if (memberTokens.length === 0) {
      console.log("📭 No valid FCM tokens found for group members");
      return;
    }
 
    // ✅ Prepare message content
    let messageBody = "New message";
    const groupName = groupData.title || "Group Chat";
    const senderName = messageData.sender_name || "Someone";
 
    if (messageData.text) {
      const decryptedText = await decryptText(messageData.text);
      messageBody =
        decryptedText.length > 50
          ? `${decryptedText.substring(0, 50)}...`
          : decryptedText;
    }
 
    if (messageData.attachment) {
      switch (messageData.attachment.type) {
        case "image":
          messageBody = "📷 sent an image";
          break;
        case "video":
          messageBody = "🎥 sent a video";
          break;
        case "audio":
          messageBody = "🎵 sent an audio";
          break;
        case "document":
          messageBody = "📄 sent a document";
          break;
        default:
          messageBody = "📎 sent an attachment";
      }
    }
 
    // ✅ Send notifications to all group members
    const notificationResults = {
      successCount: 0,
      failureCount: 0,
      responses: [] as any[],
    };
 
    const sendPromises = memberTokens.map(async (token) => {
      try {
        const message = {
          token: token,
          notification: {
            title: `${senderName} in ${groupName}`,
            body: messageBody,
          },
          android: {
            notification: {
              sound: "default",
              clickAction: "FCM_PLUGIN_ACTIVITY",
              icon: "ic_launcher",
              tag: roomId,
            },
          },
          data: {
            payload: JSON.stringify({
              roomId: String(roomId),
              senderId: String(messageData.sender),  // ✅ Using 'sender' consistently
              messageId: String(messageId),
              chatType: "group",
              groupName: String(groupName),
              timestamp: String(messageData.timestamp),
            }),
          },
        };
 
        const response = await admin.messaging().send(message);
        notificationResults.successCount++;
        notificationResults.responses.push({
          success: true,
          messageId: response,
        });
        console.log(
          `✅ Group notification sent to token: ${token.substring(0, 10)}...`
        );
      } catch (error: any) {
        notificationResults.failureCount++;
        notificationResults.responses.push({
          success: false,
          error: error,
          token: token,
        });
        console.error(
          `❌ Failed to send group notification to token ${token.substring(
            0,
            10
          )}...:`,
          error.message
        );
      }
    });
 
    await Promise.all(sendPromises);
 
    console.log("✅ Group notifications sent:", {
      successCount: notificationResults.successCount,
      failureCount: notificationResults.failureCount,
      totalTokens: memberTokens.length,
      senderExcluded: messageData.sender
    });
 
    // ✅ Update message notification status
    await admin
      .database()
      .ref(`/chats/${roomId}/${messageId}/notified`)
      .set(true);
  } catch (error) {
    console.error("❌ Error sending group notification:", error);
  }
}





















