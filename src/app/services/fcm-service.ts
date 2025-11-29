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
    private firebaseChatService : FirebaseChatService
  ) {}

  // Helper to actively request a fresh token and return it (one-time listener)
  private async getFreshToken(timeoutMs = 8000): Promise<string> {
    return new Promise<string>(async (resolve, reject) => {
      try {
        // Ensure permission
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive !== 'granted') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          return reject(new Error('Push notification permission denied'));
        }

        // One-time listener for registration
        let listener: PluginListenerHandle | null = null;
        const cleanup = () => {
          if (listener && typeof listener.remove === 'function') {
            listener.remove();
          }
        };

        listener = await PushNotifications.addListener(
          'registration',
          (token: Token) => {
            try {
              this.fcmToken = token.value;
              cleanup();
              resolve(token.value);
            } catch (e) {
              cleanup();
              reject(e);
            }
          }
        );

        // Register to trigger token generation/refresh
        await PushNotifications.register();

        // Timeout fallback
        const timer = setTimeout(() => {
          cleanup();
          if (this.fcmToken) {
            resolve(this.fcmToken); // return what we have if any
          } else {
            reject(new Error('Timed out waiting for registration token'));
          }
        }, timeoutMs);

        // Ensure we clear timeout when resolved/rejected
        const origResolve = resolve;
        const origReject = reject;
        resolve = (v: any) => {
          clearTimeout(timer);
          origResolve(v);
          return v;
        };
        reject = (err: any) => {
          clearTimeout(timer);
          origReject(err);
          throw err;
        };
      } catch (err) {
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

      // ✅ ADDITIONAL: Handle app state resume (for better reliability)
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          //console.log('App became active, checking for pending notifications');
          this.checkForPendingNotifications();
        }
      });

      // ✅ ADDITIONAL: Custom event listener for MainActivity
      window.addEventListener('notificationTapped', (event: any) => {
        //console.log('👉 Custom notification event from MainActivity:', event.detail);
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

    if (receiverId) {
      console.log({receiverId})
      console.log("opening open chat roomId ", roomId)
      this.firebaseChatService.openChat({roomId})
      this.router.navigate(['/chatting-screen'], {
        queryParams: { receiverId },
        state: { fromNotification: 'true' }
      });

      localStorage.setItem('fromNotification', 'true');
      return;
    }

    this.router.navigate(['/home-screen']);
  }

  // ✅ Check for pending notifications (when app becomes active)
  private async checkForPendingNotifications() {
    try {
      // Check for delivered notifications that might have been tapped
      // NOTE: getDeliveredNotifications is part of Capacitor Push Notifications plugin API
      // but may not be available on all platforms; keep try/catch
      // @ts-ignore
      const delivered = await PushNotifications.getDeliveredNotifications?.();
      //console.log('📨 Delivered notifications:', delivered);
    } catch (error) {
      console.error('Error checking delivered notifications:', error);
    }
  }

  // ✅ Enhanced foreground local notification
  private async showLocalNotification(notification: PushNotificationSchema) {
    try {
      // ✅ Extract data properly - check both data and body for FCM structure
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

  // ✅ Save FCM token & user info to Firebase
  async saveFcmTokenToDatabase(
    userId: string,
    userName: string,
    userPhone: string
  ) {
    try {
      if (!this.fcmToken) {
        //console.log('⚠️ FCM Token not available yet, will retry in 2s...');
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
      //console.log('✅ User data + FCM token saved');
    } catch (error) {
      console.error('❌ Error saving FCM token:', error);
    }
  }

  // ✅ Update FCM token only — now actively requests a fresh token
  async updateFcmToken(userId: string) {
    try {
      if (!userId) {
        console.warn('⚠️ updateFcmToken: userId is required');
        return;
      }

      // Actively request a fresh token
      try {
        const freshToken = await this.getFreshToken(8000);
        if (freshToken) {
          this.fcmToken = freshToken;
          const db = getDatabase();
          const tokenRef = ref(db, `users/${userId}/fcmToken`);
          await set(tokenRef, this.fcmToken);
          // also update lastActive or whatever metadata you want
          await set(
            ref(db, `users/${userId}/lastActive`),
            new Date().toISOString()
          );
          //console.log('✅ FCM Token refreshed and updated successfully:', this.fcmToken);
        } else {
          console.warn('⚠️ No fresh token received, skipping DB update');
        }
      } catch (err) {
        console.error('❌ Failed to refresh token:', err);
      }
    } catch (error) {
      console.error('❌ Error updating FCM token:', error);
    }
  }

  getFcmToken(): string {
    return this.fcmToken;
  }

  // ✅ Delete FCM token
  // async deleteFcmToken(userId: string) {
  //   try {
  //     if (!userId) {
  //       console.warn('⚠️ deleteUser: userId is required');
  //       return;
  //     }

  //     const db = getDatabase();
  //     const userRef = ref(db, `users/${userId}/fcmToken`);

  //     await remove(userRef);

  //     //console.log('🗑️ User token deleted successfully:', userId);

  //   } catch (error) {
  //     console.error('❌ Error deleting user token:', error);
  //   }
  // }

  async deleteFcmToken(userId: string) {
    try {
      if (!userId) {
        console.warn('⚠️ deleteFcmToken: userId is required');
        return;
      }

      const db = getDatabase();
      const userRef = ref(db, `users/${userId}/fcmToken`);

      // Remove token from Firebase
      await remove(userRef);
      // //console.log('🗑️ User token deleted successfully from Firebase:', userId);

      // Also call backend logout API
      const UserId = Number(userId);
      if (!Number.isNaN(UserId)) {
        this.service.logoutUser(UserId).subscribe({
          next: (res) => {
            //console.log('✅ Backend logout success:', res);
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
