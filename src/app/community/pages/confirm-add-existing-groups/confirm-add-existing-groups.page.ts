import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, NavController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-confirm-add-existing-groups',
  templateUrl: './confirm-add-existing-groups.page.html',
  styleUrls: ['./confirm-add-existing-groups.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class ConfirmAddExistingGroupsPage implements OnInit {
  communityId: string | null = null;
  communityName: string | null = null;
  userId: string | null = null;
  groups: any[] = [];

  loading = false;
  adding = false;

  constructor(
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.userId = this.authService?.authData?.userId ?? null;

    // Get data from navigation state
    const navState: any = this.router.getCurrentNavigation()?.extras?.state;
    const histState: any = window.history.state;

    this.communityId = navState?.communityId || histState?.communityId || null;
    this.communityName =
      navState?.communityName || histState?.communityName || null;
    this.groups =
      navState?.groups ||
      histState?.groups ||
      navState?.selected ||
      histState?.selected ||
      [];

    if (!this.groups || this.groups.length === 0) {
      console.warn('⚠️ No groups passed to confirm page');
    }
  }

  /**
   * ✅ SIMPLIFIED - All DB logic moved to service
   */
  async addToCommunity() {
    if (!this.communityId) {
      const t = await this.toastCtrl.create({
        message: 'Community ID missing',
        duration: 2000,
        color: 'danger',
      });
      await t.present();
      return;
    }

    const groupIds = this.groups.map((g) => g.id).filter(Boolean);
    if (!groupIds.length) {
      const t = await this.toastCtrl.create({
        message: 'No groups to add',
        duration: 1500,
      });
      await t.present();
      return;
    }

    this.adding = true;

    try {
      // 1️⃣ Get backend community ID (optional, for API sync)
      let backendCommunityId: string | null = null;
      try {
        backendCommunityId = await this.firebaseService.getBackendCommunityId(
          this.communityId
        );
        if (!backendCommunityId) {
          console.warn('Could not resolve backend community ID');
        }
      } catch (e) {
        console.warn('getBackendCommunityId failed:', e);
      }

      // 2️⃣ Call the main service method that handles everything
      const result = await this.firebaseService.addGroupsToCommunity({
        communityId: this.communityId,
        groupIds: groupIds,
        backendCommunityId: backendCommunityId,
        currentUserId: this.userId || undefined,
      });

      // 3️⃣ Handle result
      if (result.success) {
        const toast = await this.toastCtrl.create({
          message: result.message || 'Groups added successfully!',
          duration: 2500,
          color: 'success',
        });
        await toast.present();

        // Navigate back to community detail
        this.navCtrl.navigateBack('/community-detail', {
          queryParams: {
            receiverId: this.communityId,
          },
          state: {
            communityId: this.communityId,
          },
        });
      } else {
        throw new Error(result.message || 'Failed to add groups');
      }
    } catch (err: any) {
      console.error('addToCommunity failed:', err);
      const msg = err?.message || String(err);
      const t = await this.toastCtrl.create({
        message: `Failed to add groups: ${msg}`,
        duration: 4000,
        color: 'danger',
      });
      await t.present();
    } finally {
      this.adding = false;
    }
  }

  /**
   * Cancel and go back
   */
  cancel() {
    this.navCtrl.back();
  }
}
