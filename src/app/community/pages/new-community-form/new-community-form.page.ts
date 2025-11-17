import { Component, OnInit } from '@angular/core';
import { IonicModule, LoadingController, NavController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { Router } from '@angular/router';
import { ApiService } from 'src/app/services/api/api.service';
import { firstValueFrom } from 'rxjs';
import { CreateCommunityPayload, CreateCommunityResponse } from 'src/types'; 
// <-- adjust this import if your interfaces are in a different file

@Component({
  selector: 'app-new-community-form',
  templateUrl: './new-community-form.page.html',
  styleUrls: ['./new-community-form.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class NewCommunityFormPage implements OnInit {
  communityName: string = '';
  communityDescription: string =
    'Hi everyone! This community is for members to chat in topic-based groups and get important announcements.';

  // optional fields you may show in UI later
  communityDp: string = '';
  isPublic: boolean = true;
  maxMembers: number = 1000;
  canEditDp: boolean = true;
  canAddMembers: boolean = true;
  canAddGroups: boolean = true;

  userId: string | null = null;

  constructor(
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private router: Router,
    private api: ApiService
  ) {}

  ngOnInit() {
    this.userId = this.authService?.authData?.userId ?? null;
  }

async createCommunity() {
  if (!this.communityName || !this.communityName.trim()) {
    const t = await this.toastCtrl.create({
      message: 'Please enter a community name.',
      duration: 2000,
      color: 'warning',
    });
    await t.present();
    return;
  }

  if (!this.userId) {
    const t = await this.toastCtrl.create({
      message: 'User not authenticated. userId missing.',
      duration: 3000,
      color: 'danger',
    });
    await t.present();
    console.error('createCommunity aborted: userId is null/undefined');
    return;
  }

  const loading = await this.loadingCtrl.create({
    message: 'Creating community...',
    backdropDismiss: false
  });
  await loading.present();

  // Generate firebase community id on client
  const firebaseCommunityId = `community_${Date.now()}`;

  try {
    // 1️⃣ Create in Firebase (this now handles userchats, groups, etc.)
    const result = await this.firebaseService.createCommunity({
      communityId: firebaseCommunityId,
      communityName: this.communityName.trim(),
      description: this.communityDescription || '',
      createdBy: this.userId,
      avatar: this.communityDp || '',
      privacy: this.isPublic ? 'public' : 'invite_only',
    });

    console.log('✅ Community created in Firebase:', result);

    // 2️⃣ Call backend API to sync with server
    const payload: CreateCommunityPayload & { firebase_community_id?: string } = {
      community_name: this.communityName.trim(),
      description: this.communityDescription || '',
      community_dp: this.communityDp || '',
      is_public: !!this.isPublic,
      max_members: this.maxMembers || 1000,
      can_edit_dp: !!this.canEditDp,
      can_add_members: !!this.canAddMembers,
      can_add_groups: !!this.canAddGroups,
      creatorId: Number(this.userId),
      firebase_community_id: firebaseCommunityId
    };

    try {
      const res: CreateCommunityResponse = await firstValueFrom(
        this.api.createCommunity(payload)
      );
      
      if (res && res.status) {
        console.log('✅ Community synced with backend:', res.data);
      } else {
        console.warn('⚠️ Backend sync returned non-success', res);
      }
    } catch (apiErr) {
      console.warn('⚠️ Backend API call failed (continuing anyway):', apiErr);
    }

    // 3️⃣ Success
    await loading.dismiss();
    
    const success = await this.toastCtrl.create({
      message: 'Community created successfully! 🎉',
      duration: 2000,
      color: 'success'
    });
    await success.present();

    // Navigate to community detail page
    this.router.navigate(['/community-detail'], {
      queryParams: { communityId: firebaseCommunityId }
    });

  } catch (err: any) {
    await loading.dismiss();
    console.error('❌ createCommunity failed:', err);
    
    const msg = err?.message || err?.code || 'Unknown error occurred';
    const t = await this.toastCtrl.create({
      message: `Failed to create community: ${msg}`,
      duration: 6000,
      color: 'danger'
    });
    await t.present();
  }
}

  changePhoto() {
    this.toastCtrl.create({
      message: 'Change photo clicked! (Integrate Camera/Gallery here)',
      duration: 2000,
      color: 'primary'
    }).then(t => t.present());
  }
}
