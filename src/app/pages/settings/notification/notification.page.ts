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

  /**
   * Check current notification permission status and update toggle
   */
  private async checkNotificationPermission(): Promise<void> {
    try {
      const permStatus = await PushNotifications.checkPermissions();
      console.log('📱 Current permission status:', permStatus.receive);
      
      // Update toggle based on current permission
      this.highPriority = permStatus.receive === 'granted';
      
      // Also load any saved settings
      this.loadSettings();
    } catch (error) {
      console.error('❌ Error checking notification permission:', error);
      this.highPriority = false;
    }
  }

  /**
   * Handle toggle change - request or disable notifications
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
   * Enable notifications - request permission
   */
  private async enableNotifications(): Promise<void> {
    try {
      console.log('✅ Requesting notification permissions...');
      
      let permStatus = await PushNotifications.checkPermissions();
      
      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        // Request permission
        permStatus = await PushNotifications.requestPermissions();
      }
      
      if (permStatus.receive === 'granted') {
        console.log('✅ Notification permission granted');
        this.highPriority = true;
        
        // Re-initialize push notifications
        await this.fcmService.initializePushNotifications();
        
        this.saveSettings();
        
        // Show success message with settings option
        await this.showSuccessAlert();
      } else if (permStatus.receive === 'denied') {
        // Permission denied - guide user to settings
        console.warn('⚠️ Notification permission denied');
        this.highPriority = false;
        
        await this.showPermissionDeniedAlert();
      } else {
        // Other status (like 'prompt')
        console.log('⚠️ Permission status:', permStatus.receive);
        this.highPriority = false;
      }
      
    } catch (error) {
      console.error('❌ Error enabling notifications:', error);
      this.highPriority = false;
      
      await this.showErrorAlert();
    }
  }

  /**
   * Disable notifications - clear all notifications and update status
   */
  private async disableNotifications(): Promise<void> {
    try {
      console.log('🔕 Disabling notifications...');
      
      // Clear all existing notifications
      await this.fcmService.clearAllNotifications();
      
      this.highPriority = false;
      this.saveSettings();
      
      // Show info alert with settings option
      await this.showDisabledAlert();
      
      console.log('✅ Notifications disabled');
      
    } catch (error) {
      console.error('❌ Error disabling notifications:', error);
      
      await this.showErrorAlert();
    }
  }

  /**
   * Open device app settings
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
   * Show success alert when notifications are enabled
   */
  private async showSuccessAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Notifications Enabled',
      message: 'You will now receive push notifications from this app.',
      buttons: [
        {
          text: 'OK',
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Show alert when notifications are disabled
   */
  private async showDisabledAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Notifications Disabled',
      message: 'Notifications have been disabled. To completely turn off notifications, you can manage settings from your device.',
      buttons: [
        {
          text: 'OK',
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Show alert when permission is denied
   */
  private async showPermissionDeniedAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Permission Denied',
      message: 'Notification permission was denied. Please enable it from your device settings to receive notifications.',
      buttons: [
        {
          text: 'OK',
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Show error alert
   */
  private async showErrorAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Error',
      message: 'Something went wrong. Please try again or check your device settings.',
      buttons: [
        {
          text: 'OK',
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  /**
   * Show alert to guide user to app settings
   */
  private async showSettingsAlert(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Permission Required',
      message: 'Notifications are blocked. Please enable them in your device settings.',
      buttons: [
        {
          text: 'OK',
          handler: () => {
            this.openAppSettings();
          }
        }
      ]
    });

    await alert.present();
  }

  openMessageNotifications() {
    this.router.navigate(['settings/notifications/message']);
  }

  openGroupNotifications() {
    this.router.navigate(['settings/notifications/group']);
  }

  openCallNotifications() {
    this.router.navigate(['settings/notifications/call']);
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      
      const data = JSON.parse(raw);
      if (typeof data.highPriority === 'boolean') {
        // Only apply saved setting if it matches current permission
        // This prevents mismatch between toggle and actual permission
        this.highPriority = data.highPriority && this.highPriority;
      }
    } catch (e) {
      console.warn('Could not load notification settings', e);
    }
  }

  ionViewWillLeave() {
    this.saveSettings();
  }

  private saveSettings() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ highPriority: this.highPriority })
      );
    } catch (e) {
      console.warn('Could not save notification settings', e);
    }
  }
}