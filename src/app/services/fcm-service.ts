import { Injectable } from '@angular/core';
import {
  PushNotifications,
  Token,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import {
  LocalNotifications,
  LocalNotificationActionPerformed,
} from '@capacitor/local-notifications';
import { getDatabase, ref, remove, set, update } from 'firebase/database';
import { Router } from '@angular/router';
import { Platform, ToastController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { AuthService } from '../auth/auth.service';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { ApiService } from './api/api.service';
import { FirebaseChatService } from './firebase-chat.service';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';


@Injectable({
  providedIn: 'root',
})
export class FcmService {
  private fcmToken: string = '';
  // ✅ Track active notifications by roomId
  private activeNotifications = new Map<string, number>();

  constructor(
    private router: Router,
    private platform: Platform,
    private toastController: ToastController,
    private authService: AuthService,
    private service: ApiService,
    private firebaseChatService: FirebaseChatService
  ) {}

  // Helper to actively request a fresh token and return it (one-time listener)
  private async getFreshToken(timeoutMs = 10000): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      let timeoutId: any = null;
      let listener: PluginListenerHandle | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (listener && typeof listener.remove === 'function') {
          listener.remove();
          listener = null;
        }
      };

      try {
        // Check and request permissions
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive !== 'granted') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          cleanup();
          return reject(new Error('Push notification permission denied'));
        }

        // Set up one-time registration listener
        listener = await PushNotifications.addListener(
          'registration',
          (token: Token) => {
            console.log(
              '📱 Registration token received:',
              token.value.substring(0, 20) + '...'
            );
            this.fcmToken = token.value;
            cleanup();
            resolve(token.value);
          }
        );

        // Set up timeout
        timeoutId = setTimeout(() => {
          console.warn('⏱️ Token request timed out');
          cleanup();
          if (this.fcmToken) {
            resolve(this.fcmToken);
          } else {
            reject(new Error('Timed out waiting for registration token'));
          }
        }, timeoutMs);

        // Trigger registration
        console.log('📲 Triggering push notification registration...');
        await PushNotifications.register();
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  async initializePushNotifications(): Promise<boolean> {
    try {
      // ✅ Request push notification permissions
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive !== 'granted') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        console.warn('Push notification permission denied');
        return false;
      }

      // ✅ Register for push notifications & try to get token
      await PushNotifications.register();

      // Try to populate token (if registration listener in initialize isn't fired, use getFreshToken)
      // but avoid double-listening — use getFreshToken only if this.fcmToken is not already set
      if (!this.fcmToken) {
        try {
          const token = await this.getFreshToken(8000).catch(() => '');
          if (token) {
            this.fcmToken = token;
            //console.log('Initial FCM token obtained during init:', token);
          }
        } catch (e) {
          console.warn('Could not get initial token via getFreshToken:', e);
        }
      }

      // ✅ Request local notification permissions
      const localPerm = await LocalNotifications.requestPermissions();
      if (localPerm.display !== 'granted') {
        console.warn('Local notification permission not granted');
      }

      // 📌 Token registration (persistent listener for normal registration events)
      PushNotifications.addListener('registration', (token: Token) => {
        //console.log('✅ FCM Token (registration listener):', token.value);
        this.fcmToken = token.value;
      });

      // ❌ Registration error
      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('❌ FCM registration error:', error);
      });

      // 📩 Foreground push - UPDATED with notification tracking
      PushNotifications.addListener(
        'pushNotificationReceived',
        async (notification: PushNotificationSchema) => {
          console.log('📩 Foreground push received:', notification);
          
          // ✅ Extract roomId and store notification ID
          let payload = notification.data?.payload;
          if (payload) {
            try {
              const data = JSON.parse(payload);
              if (data.roomId) {
                // Store this notification ID for later removal
                const notifId = Math.floor(Math.random() * 1000000);
                this.activeNotifications.set(data.roomId, notifId);
                console.log(`📌 Stored notification ID ${notifId} for room ${data.roomId}`);
                
                // Pass notification ID to local notification
                await this.showLocalNotification(notification, notifId, data.roomId);
                return;
              }
            } catch (e) {
              console.error('Error parsing notification payload:', e);
            }
          }
          
          // Fallback if no roomId
          await this.showLocalNotification(notification);
        }
      );

      // 👉 CRITICAL: Background notification tapped
      PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (notification: ActionPerformed) => {
          console.log('👉 Raw notification tap:', notification);

          let payload = notification.notification?.data?.payload;
          let data: any = {};

          try {
            if (payload) data = JSON.parse(payload);
          } catch (e) {
            console.error('❌ JSON parse error:', e);
          }

          console.log('👉 Parsed tap data:', data);

          this.handleNotificationTap(data);
        }
      );

      // 👉 Local notification tapped (when shown in foreground)
      LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (evt: LocalNotificationActionPerformed) => {
          console.log('👉 Local tap event:', evt);

          let payload = evt.notification?.extra?.payload;
          let data: any = {};

          try {
            if (payload) data = JSON.parse(payload);
          } catch (e) {
            console.error('❌ JSON parse error:', e);
          }

          console.log('👉 Parsed Local tap data:', data);
          this.handleNotificationTap(data);
        }
      );

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          this.checkForPendingNotifications();
        }
      });

      window.addEventListener('notificationTapped', (event: any) => {
        try {
          const data = JSON.parse(event.detail);
          this.handleNotificationTap(data);
        } catch (e) {
          console.error('Error parsing notification data:', e);
        }
      });

      return true;
    } catch (error) {
      console.error('❌ Error initializing push notifications:', error);
      return false;
    }
  }

  private async handleNotificationTap(data: any) {
    console.log('🎯 Final Tap Data Received:', data);

    const receiverId = data?.receiverId;
    const roomId = data?.roomId;

    if (receiverId && roomId) {
      console.log({ receiverId, roomId });
      console.log('Opening chat with roomId:', roomId);

      try {
        await this.firebaseChatService.openChat({ roomId });

        // await this.firebaseChatService.loadMessages(20, true);

        // await this.firebaseChatService.syncMessagesWithServer();

        // ✅ Clear notification when chat opens
        await this.clearNotificationForRoom(roomId);

        this.router.navigate(['/chatting-screen'], {
          queryParams: { receiverId },
          state: { fromNotification: true },
        });

        localStorage.setItem('fromNotification', 'true');

        console.log('✅ Chat opened and messages loaded successfully');
        return;
      } catch (error) {
        console.error('❌ Error opening chat from notification:', error);
        // Fallback to home if there's an error
        this.router.navigate(['/home-screen']);
        return;
      }
    }
    this.router.navigate(['/home-screen']);
  }

  // ⭐ UPDATED: Track pending notifications when app resumes
  private async checkForPendingNotifications() {
    try {
      console.log('🔍 Checking for pending notifications on app resume...');
      
      // Track pending notifications when app opens from background
      await this.trackPendingNotifications();
      
      const delivered = await PushNotifications.getDeliveredNotifications?.();
      console.log(`📬 App resumed with ${delivered?.notifications?.length || 0} push notifications`);
    } catch (error) {
      console.error('Error checking delivered notifications:', error);
    }
  }

  // ⭐ NEW: Track all pending notifications
  async trackPendingNotifications(): Promise<void> {
    try {
      console.log('📊 Tracking pending notifications...');
      
      // Get all delivered push notifications
      const pushDelivered = await PushNotifications.getDeliveredNotifications();
      console.log(`📬 Found ${pushDelivered.notifications.length} pending push notifications`);
      
      if (pushDelivered.notifications.length > 0) {
        console.log('📋 Pending notifications by room:');
        
        for (const notif of pushDelivered.notifications) {
          try {
            let payload = notif.data?.payload;
            if (payload) {
              const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
              if (data.roomId) {
                console.log(`  📌 Room ${data.roomId}: ${notif.title || 'New message'}`);
              }
            }
          } catch (e) {
            console.error('Error parsing notification:', e);
          }
        }
      } else {
        console.log('✅ No pending notifications');
      }
    } catch (error) {
      console.error('❌ Error tracking notifications:', error);
    }
  }

  // ✅ UPDATED: Accept notification ID and roomId
  private async showLocalNotification(
    notification: PushNotificationSchema,
    notificationId?: number,
    roomId?: string
  ) {
    try {
      const notificationData = notification.data || {};
      const title =
        notificationData.title || notification.title || 'New Message';
      const body =
        notificationData.body || notification.body || 'You have a new message';

      const finalNotificationId = notificationId || Math.floor(Math.random() * 1000000);

      // ✅ Store notification ID if roomId is available
      if (roomId && !this.activeNotifications.has(roomId)) {
        this.activeNotifications.set(roomId, finalNotificationId);
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            id: finalNotificationId,
            title,
            body,
            extra: notificationData,
            smallIcon: 'ic_notification',
            sound: 'default',
            schedule: { at: new Date(Date.now() + 500) },
          },
        ],
      });

      const toast = await this.toastController.create({
        message: body,
        duration: 3000,
        position: 'top',
        cssClass: 'custom-toast',
        buttons: [
          {
            text: '',
            handler: () => {
              this.handleNotificationTap(notificationData);
            },
          },
        ],
      });

      await toast.present();
    } catch (error) {
      console.error('❌ Error scheduling local notification or toast:', error);
    }
  }

  // ✅ Clear notifications ONLY for specific roomId
  async clearNotificationForRoom(roomId: string): Promise<void> {
    try {
      // console.log(`🧹 Attempting to clear notifications for room: ${roomId}`);
      
      // 1️⃣ Clear stored local notification ID (foreground notifications)
      const storedNotificationId = this.activeNotifications.get(roomId);
      
      if (storedNotificationId) {
        // console.log(`📌 Clearing stored local notification ${storedNotificationId} for room ${roomId}`);
        
        try {
          await LocalNotifications.cancel({
            notifications: [{ id: storedNotificationId }]
          });
          
          this.activeNotifications.delete(roomId);
          console.log(`✅ Stored local notification cleared for room ${roomId}`);
        } catch (e) {
          console.error('Error clearing stored notification:', e);
        }
      } else {
        console.log(`⚠️ No stored notification ID for room ${roomId}`);
      }
      
      // 2️⃣ Clear ALL delivered local notifications matching this roomId
      try {
        const delivered = await LocalNotifications.getDeliveredNotifications();
        // console.log(`📬 Found ${delivered.notifications.length} total delivered local notifications`);
        
        if (delivered.notifications.length > 0) {
          const notificationsToCancel: number[] = [];
          
          for (const notif of delivered.notifications) {
            try {
              let payload = notif.extra?.payload;
              
              if (payload) {
                const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                
                if (data.roomId === roomId) {
                  notificationsToCancel.push(notif.id);
                  // console.log(`📍 Found local notification ${notif.id} matching room ${roomId}`);
                }
              }
            } catch (e) {
              console.error(`Error parsing notification ${notif.id}:`, e);
            }
          }
          
          if (notificationsToCancel.length > 0) {
            await LocalNotifications.cancel({
              notifications: notificationsToCancel.map(id => ({ id }))
            });
            console.log(`✅ Cleared ${notificationsToCancel.length} local notifications for room ${roomId}`);
          } else {
            console.log(`⚠️ No local notifications found matching room ${roomId}`);
          }
        }
      } catch (e) {
        console.error('❌ Error checking/clearing local notifications:', e);
      }

      try {
        // Get all delivered push notifications
        const pushDelivered = await PushNotifications.getDeliveredNotifications();
        // console.log(`📬 Found ${pushDelivered.notifications.length} delivered push notifications`);
        
        if (pushDelivered.notifications.length > 0) {
          const pushesToRemove: any[] = [];
          
          for (const notif of pushDelivered.notifications) {
            // console.log("🔍 Full notification object:", notif);
            // console.log("🔍 Notification data:", notif.data);
            // console.log("🔍 Notification tag:", notif.tag);
            
            try {
              let data: any = null;
              
              if (notif.data?.payload) {
                const payload = notif.data.payload;
                data = typeof payload === 'string' ? JSON.parse(payload) : payload;
                // console.log("✅ Found payload in notif.data.payload:", data);
              }
              else if (notif.data) {
                data = notif.data;
                // console.log("✅ Using notif.data directly:", data);
              }
              else if (notif.tag && notif.tag.includes('FCM-Notification')) {
                console.log("⚠️ No data found, using tag-based matching");
              }
              
              // Check if we found roomId
              if (notif.tag) {
                // console.log(`🔍 Checking push notification:`, {
                //   id: notif.id,
                //   tag: notif.tag,
                //   roomId: data.roomId,
                //   targetRoomId: roomId,
                //   matches: data.roomId === roomId
                // });
                
                if (notif.tag === roomId) {
                  pushesToRemove.push({
                    id: notif.id,
                    tag: notif.tag || '',
                    data: notif.data || {}
                  });
                  console.log(`📍 Found push notification matching room ${roomId}`, notif.id);
                }
              } else {
                console.log(`⚠️ No roomId found in notification ${notif.id}, skipping`);
              }
            } catch (e) {
              console.error(`❌ Error parsing push notification ${notif.id}:`, e);
            }
          }
          
          // Remove only matching push notifications
          if (pushesToRemove.length > 0) {
            try {
              // console.log(`🗑️ Attempting to remove ${pushesToRemove.length} notifications:`, pushesToRemove);
              await PushNotifications.removeDeliveredNotifications({
                notifications: pushesToRemove
              });
              // console.log(`✅ Cleared ${pushesToRemove.length} push notifications for room ${roomId}`);
            } catch (e) {
              console.error(`❌ Error removing push notifications:`, e);
            }
          } else {
            console.log(`⚠️ No push notifications found matching room ${roomId}`);
          }
        }
      } catch (e) {
        console.error('❌ Error checking/clearing push notifications:', e);
        console.warn('⚠️ Could not selectively clear push notifications - keeping all to avoid data loss');
      }
      
      console.log(`✅ Notification clearing completed for room ${roomId}`);
      
    } catch (error) {
      console.error('❌ Error in clearNotificationForRoom:', error);
    }
  }

  // Clear ALL notifications (for logout or app reset)
  async clearAllNotifications(): Promise<void> {
    try {
      console.log('🧹 Clearing ALL notifications');
      
      // Clear all stored notification IDs
      this.activeNotifications.clear();
      
      // Clear all local notifications
      const delivered = await LocalNotifications.getDeliveredNotifications();
      if (delivered.notifications.length > 0) {
        await LocalNotifications.cancel({
          notifications: delivered.notifications.map(n => ({ id: n.id }))
        });
      }
      
      // Clear all push notifications
      await PushNotifications.removeAllDeliveredNotifications();
      
      console.log('✅ All notifications cleared');
    } catch (error) {
      console.error('❌ Error clearing all notifications:', error);
    }
  }

  // Expose method to get stored notification ID (if needed)
  getNotificationIdForRoom(roomId: string): number | undefined {
    return this.activeNotifications.get(roomId);
  }

  // When user turns ON from toggle: ask permission + register FCM
  async askNotificationPermissionAndRegister(): Promise<boolean> {
    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive !== 'granted') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive !== 'granted') {
        console.warn('Push notification permission denied by user');
        return false;
      }

      await PushNotifications.register();

      // Local notifications (optional)
      try {
        const localPerm = await LocalNotifications.requestPermissions();
        if (localPerm.display !== 'granted') {
          console.warn('Local notification permission not granted');
        }
      } catch (e) {
        console.warn('Local notification permission check failed', e);
      }

      return true;
    } catch (error) {
      console.error('❌ Error while asking notification permission:', error);
      return false;
    }
  }

  // native app settings so user can turn notification OFF/ON there
  async openAppSettingsForNotifications(): Promise<void> {
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.AppNotification,
      });
    } catch (error) {
      console.error('❌ Error opening native settings:', error);
    }
  }

  // Save FCM token with isPermission flag set to TRUE
  async saveFcmTokenToDatabase(
    userId: string,
    userName: string,
    userPhone: string
  ) {
    try {
      if (!this.fcmToken) {
        setTimeout(
          () => this.saveFcmTokenToDatabase(userId, userName, userPhone),
          2000
        );
        return;
      }

      const db = getDatabase();
      const userRef = ref(db, `users/${userId}`);

      const userData = {
        name: userName,
        phone: userPhone,
        fcmToken: this.fcmToken,
        platform: this.isIos() ? 'ios' : 'android',
        lastActive: new Date().toISOString(),
        isPermission: true, // ✅ Set to TRUE when token is saved
      };

      await set(userRef, userData);
      console.log('✅ FCM token saved with isPermission: true');
    } catch (error) {
      console.error('❌ Error saving FCM token:', error);
    }
  }

  getFcmToken(): string {
    return this.fcmToken;
  }

  // Update FCM token with isPermission flag set to TRUE
  async updateFcmToken(userId: string): Promise<string | null> {
    try {
      if (!userId) {
        console.warn('⚠️ updateFcmToken: userId is required');
        return null;
      }

      console.log('🔄 Requesting fresh FCM token for user:', userId);
      this.fcmToken = '';
      try {
        const freshToken = await this.getFreshToken(10000);

        if (freshToken) {
          this.fcmToken = freshToken;
          console.log(
            '✅ Fresh token obtained:',
            freshToken.substring(0, 20) + '...'
          );

          // Update in Firebase
          const db = getDatabase();
          const userRef = ref(db, `users/${userId}`);
          
          await update(userRef, {
            fcmToken: this.fcmToken,
            platform: this.isIos() ? 'ios' : 'android',
            lastActive: new Date().toISOString(),
            isPermission: true, // ✅ Set to TRUE when token is updated
          });

          console.log('✅ FCM token updated in Firebase with isPermission: true');
          return this.fcmToken;
        } else {
          console.warn('⚠️ No fresh token received');
          return null;
        }
      } catch (err) {
        console.error('❌ Failed to get fresh token:', err);
        return null;
      }
    } catch (error) {
      console.error('❌ Error in updateFcmToken:', error);
      return null;
    }
  }

  // ✅ UPDATED: Delete FCM token and set isPermission flag to FALSE
  async deleteFcmToken(userId: string) {
    try {
      if (!userId) {
        console.warn('⚠️ deleteFcmToken: userId is required');
        return;
      }

      const db = getDatabase();
      const userRef = ref(db, `users/${userId}`);

      await update(userRef, {
        fcmToken: null,
        isPermission: false,
        lastActive: new Date().toISOString(),
      });

      console.log('✅ FCM token deleted and isPermission set to false');

      const UserId = Number(userId);
      if (!Number.isNaN(UserId)) {
        this.service.logoutUser(UserId).subscribe({
          next: (res) => {
            console.log('✅ Backend logout successful');
          },
          error: (err) => {
            console.error('❌ Backend logout failed:', err);
          },
        });
      } else {
        console.warn(
          '⚠️ Provided userId is not numeric — skipping backend logout API call'
        );
      }
    } catch (error) {
      console.error('❌ Error deleting user token:', error);
    }
  }

  // new Method to update only isPermission flag (useful for toggle changes)
  async updatePermissionStatus(userId: string, isPermission: boolean): Promise<void> {
    try {
      if (!userId) {
        console.warn('⚠️ updatePermissionStatus: userId is required');
        return;
      }

      const db = getDatabase();
      const userRef = ref(db, `users/${userId}`);

      await update(userRef, {
        isPermission: isPermission,
        lastActive: new Date().toISOString(),
      });

      console.log(`✅ isPermission updated to ${isPermission} for user ${userId}`);
    } catch (error) {
      console.error('❌ Error updating permission status:', error);
    }
  }

  async setUserOffline(userId: string) {
    try {
      const db = getDatabase();
      const userRef = ref(db, `users/${userId}/isOnline`);
      await set(userRef, false);
    } catch (error) {
      console.error('❌ Error setting user offline:', error);
    }
  }

  private isIos(): boolean {
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
  }
}