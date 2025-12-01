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
import { getDatabase, ref, remove, set } from 'firebase/database';
import { Router } from '@angular/router';
import { Platform, ToastController } from '@ionic/angular';
import { App } from '@capacitor/app';
import { AuthService } from '../auth/auth.service';
import { PluginListenerHandle } from '@capacitor/core';
import { ApiService } from './api/api.service';
import { FirebaseChatService } from './firebase-chat.service';

@Injectable({
  providedIn: 'root',
})
export class FcmService {
  private fcmToken: string = '';

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

      // 📩 Foreground push
      PushNotifications.addListener(
        'pushNotificationReceived',
        async (notification: PushNotificationSchema) => {
          //console.log('📩 Foreground push received:', notification);
          await this.showLocalNotification(notification);
        }
      );

      // 👉 CRITICAL: Background notification tapped
      // PushNotifications.addListener('pushNotificationActionPerformed', (notification: ActionPerformed) => {
      //   //console.log('👉 Background push action performed:', notification);
      //   this.handleNotificationTap(notification.notification?.data || {});
      // });

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
      // LocalNotifications.addListener('localNotificationActionPerformed', (evt: LocalNotificationActionPerformed) => {
      //   //console.log('👉 Local notification tapped:', evt);
      //   this.handleNotificationTap(evt.notification?.extra || {});
      // });

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

  //  private handleNotificationTap(data: any) {
  //    console.log('🎯 Handling notification tap with data:', data);

  //    const userid = this.authService.authData?.userId;
  //    //console.log("userid", userid);

  //    if (!data || Object.keys(data).length === 0) {
  //      //console.log('No notification data available, navigating to home');
  //      this.router.navigate(['/home-screen']);
  //      return;
  //    }

  //    const receiverId = data.receiverId;

  //    if (receiverId) {
  //      this.router.navigate(['/chatting-screen'], {
  //        queryParams: { receiverId },
  //        state: { fromNotification: true }
  //      });

  //      // Persist flag for later reloads
  //      localStorage.setItem('fromNotification', 'true');
  //    } else {
  //      //console.log('Could not resolve receiverId, navigating to home');
  //      this.router.navigate(['/home-screen']);
  //    }
  //  }

  private async handleNotificationTap(data: any) {
    console.log('🎯 Final Tap Data Received:', data);

    const receiverId = data?.receiverId;
    const roomId = data?.roomId;

    if (receiverId && roomId) {
      console.log({ receiverId, roomId });
      console.log('Opening chat with roomId:', roomId);

      try {
        await this.firebaseChatService.openChat({ roomId });

        await this.firebaseChatService.loadMessages(20, true);

        await this.firebaseChatService.syncMessagesWithServer();

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

  private async checkForPendingNotifications() {
    try {
      const delivered = await PushNotifications.getDeliveredNotifications?.();
    } catch (error) {
      console.error('Error checking delivered notifications:', error);
    }
  }

  private async showLocalNotification(notification: PushNotificationSchema) {
    try {
      const notificationData = notification.data || {};
      const title =
        notificationData.title || notification.title || 'New Message';
      const body =
        notificationData.body || notification.body || 'You have a new message';

      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 1000000),
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
      };

      await set(userRef, userData);
    } catch (error) {
      console.error('❌ Error saving FCM token:', error);
    }
  }

  getFcmToken(): string {
    return this.fcmToken;
  }

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
          const tokenRef = ref(db, `users/${userId}/fcmToken`);
          await set(tokenRef, this.fcmToken);

          // Update metadata
          await set(
            ref(db, `users/${userId}/lastActive`),
            new Date().toISOString()
          );
          await set(
            ref(db, `users/${userId}/platform`),
            this.isIos() ? 'ios' : 'android'
          );

          console.log('✅ FCM token updated in Firebase successfully');
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

  async deleteFcmToken(userId: string) {
    try {
      if (!userId) {
        console.warn('⚠️ deleteFcmToken: userId is required');
        return;
      }

      const db = getDatabase();
      const userRef = ref(db, `users/${userId}/fcmToken`);

      await remove(userRef);
      const UserId = Number(userId);
      if (!Number.isNaN(UserId)) {
        this.service.logoutUser(UserId).subscribe({
          next: (res) => {
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
