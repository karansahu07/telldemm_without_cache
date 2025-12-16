import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule, AlertController } from '@ionic/angular';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { FcmService } from '../../../services/fcm-service';
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings';

const STORAGE_KEY = 'settings.notifications';

@Component({
  selector: 'app-notification',
  templateUrl: './notification.page.html',
  styleUrls: ['./notification.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, TranslateModule],
})
export class NotificationPage implements OnInit {
  highPriority = false;
  
  constructor(
    private router: Router, 
    private translate: TranslateService,
    private fcmService: FcmService,
    private alertController: AlertController
  ) {}
  
  async ngOnInit(): Promise<void> {
    await this.checkNotificationPermission();
  }

  // ✅ Check when view enters (handles back navigation from settings)
  async ionViewWillEnter(): Promise<void> {
    await this.checkNotificationPermission();
  }

  /**
   * ✅ Check current notification permission status and update toggle
   */
  private async checkNotificationPermission(): Promise<void> {
    try {
      const permStatus = await PushNotifications.checkPermissions();
      console.log('📱 Current permission status:', permStatus.receive);
      
      // ✅ Update toggle based ONLY on current permission
      this.highPriority = permStatus.receive === 'granted';
      
      // ✅ Save current state to localStorage
      this.saveSettings();
      
      console.log('✅ Toggle state updated:', this.highPriority ? 'ON' : 'OFF');
    } catch (error) {
      console.error('❌ Error checking notification permission:', error);
      this.highPriority = false;
    }
  }

  /**
   * ✅ Handle toggle change - request or disable notifications
   */
  async onToggleChange(event: any): Promise<void> {
    const isEnabled = event.detail.checked;
    console.log('🔔 Toggle changed to:', isEnabled);

    if (isEnabled) {
      // User wants to enable notifications
      await this.enableNotifications();
    } else {
      // User wants to disable notifications
      await this.disableNotifications();
    }
  }

  /**
   * ✅ Enable notifications - request permission
   */
  private async enableNotifications(): Promise<void> {
    try {
      console.log('✅ Requesting notification permissions...');
      
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        // Request permission
        permStatus = await PushNotifications.requestPermissions();
      } else if (permStatus.receive === 'denied') {
        // ✅ Permission was denied before - guide to settings immediately
        console.warn('⚠️ Notification permission denied - redirecting to settings');
        this.highPriority = false;
        await this.showPermissionDeniedAlert();
        return;
      }
      
      if (permStatus.receive === 'granted') {
        console.log('✅ Notification permission granted');
        this.highPriority = true;
        
        // Re-initialize push notifications
        await this.fcmService.initializePushNotifications();
        
        this.saveSettings();
        
        // Show success message
        await this.showSuccessAlert();
      } else {
        // Permission denied or other status
        console.warn('⚠️ Permission not granted:', permStatus.receive);
        this.highPriority = false;
        
        if (permStatus.receive === 'denied') {
          await this.showPermissionDeniedAlert();
        }
      }
      
    } catch (error) {
      console.error('❌ Error enabling notifications:', error);
      this.highPriority = false;
      
      await this.showErrorAlert();
    }
  }

  /**
   * ✅ Disable notifications - clear all notifications and update status
   */
  private async disableNotifications(): Promise<void> {
    try {
      console.log('🔕 Disabling notifications...');
      
      // ✅ Check current permission first
      const permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'granted') {
        // Permission is granted but user wants to disable
        // We can't revoke permission programmatically - guide to settings
        await this.showDisabledAlert();
      }
      
      // Clear all existing notifications
      await this.fcmService.clearAllNotifications();
      
      this.highPriority = false;
      this.saveSettings();
      
      console.log('✅ Notifications disabled in app');
      
    } catch (error) {
      console.error('❌ Error disabling notifications:', error);
      
      await this.showErrorAlert();
    }
  }

  /**
   * ✅ Open device app settings
   */
  private async openAppSettings(): Promise<void> {
    try {
      await NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.AppNotification,
      });
    } catch (error) {
      console.error('❌ Error opening native settings:', error);
    }
  }

  /**
   * ✅ Show success alert when notifications are enabled
   */
  private async showSuccessAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('notifications.alerts.success.title') || 'Notifications Enabled',
      message: this.translate.instant('notifications.alerts.success.message') || 'You will now receive push notifications from this app.',
      buttons: [
        {
          text: this.translate.instant('common.ok') || 'OK',
          role: 'cancel'
        }
      ]
    });

    await alert.present();
  }

  /**
   * ✅ Show alert when notifications are disabled
   */
  private async showDisabledAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('notifications.alerts.disabled.title') || 'Disable Notifications',
      message: this.translate.instant('notifications.alerts.disabled.message') || 'To completely turn off notifications, please disable them from your device settings.',
      buttons: [
        {
          text: this.translate.instant('common.cancel') || 'Cancel',
          role: 'cancel',
          handler: () => {
            // ✅ Reset toggle if user cancels
            this.highPriority = true;
          }
        },
        {
          text: this.translate.instant('notifications.openSettings') || 'Open Settings',
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * ✅ Show alert when permission is denied
   */
  private async showPermissionDeniedAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('notifications.alerts.denied.title') || 'Permission Denied',
      message: this.translate.instant('notifications.alerts.denied.message') || 'Notification permission was denied. Please enable it from your device settings to receive notifications.',
      buttons: [
        {
          text: this.translate.instant('common.cancel') || 'Cancel',
          role: 'cancel'
        },
        {
          text: this.translate.instant('notifications.openSettings') || 'Open Settings',
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * ✅ Show error alert
   */
  private async showErrorAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: this.translate.instant('common.error') || 'Error',
      message: this.translate.instant('notifications.alerts.error.message') || 'Something went wrong. Please try again or check your device settings.',
      buttons: [
        {
          text: this.translate.instant('common.ok') || 'OK',
          role: 'cancel'
        }
      ]
    });

    await alert.present();
  }

  openMessageNotifications() {
    if (!this.highPriority) return;
    this.router.navigate(['settings/notifications/message']);
  }

  openGroupNotifications() {
    if (!this.highPriority) return;
    this.router.navigate(['settings/notifications/group']);
  }

  openCallNotifications() {
    if (!this.highPriority) return;
    this.router.navigate(['settings/notifications/call']);
  }

  ionViewWillLeave() {
    this.saveSettings();
  }

  /**
   * ✅ Save current toggle state
   */
  private saveSettings() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ highPriority: this.highPriority })
      );
      console.log('💾 Settings saved:', this.highPriority ? 'ON' : 'OFF');
    } catch (e) {
      console.warn('Could not save notification settings', e);
    }
  }
}