import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, LoadingController, NavController, ToastController } from '@ionic/angular';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-edit-community-info',
  templateUrl: './edit-community-info.page.html',
  styleUrls: ['./edit-community-info.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class EditCommunityInfoPage implements OnInit {
  
  userId: string | null = null;
  communityId: string | null = null;
  community: any = null;
  
  // Form fields
  communityName: string = '';
  communityDescription: string = '';
  
  constructor(
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private api: ApiService,
    private navCtrl: NavController
  ) { }

  ngOnInit() {
    this.userId = this.authService?.authData?.userId ?? null;
  }

  ionViewWillEnter() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['receiverId'] || params['communityId'] || params['id'];
      if (!cid) return;
      this.communityId = cid;
      this.loadCommunityDetail();
    });
  }

  async loadCommunityDetail() {
    if (!this.communityId) return;
    
    const loading = await this.loadingCtrl.create({
      message: 'Loading community details...',
    });
    await loading.present();

    try {
      this.community = await this.firebaseService.getCommunityDetails(this.communityId);
      
      if (this.community) {
        // ✅ Prefill form fields
        this.communityName = this.community.title || this.community.name || '';
        this.communityDescription = this.community.description || '';
      }
      
    } catch (error) {
      console.error('Error loading community details:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load community details',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    } finally {
      loading.dismiss();
    }
  }

  async updateCommunity() {
    // Validation
    if (!this.communityName || this.communityName.trim().length === 0) {
      const toast = await this.toastCtrl.create({
        message: 'Community name is required',
        duration: 2000,
        color: 'warning'
      });
      await toast.present();
      return;
    }

    if (!this.communityId) {
      console.error('No community ID found');
      return;
    }

    const loading = await this.loadingCtrl.create({
      message: 'Updating community...',
    });
    await loading.present();

    try {
      // Call Firebase service to update
      const success = await this.firebaseService.updateCommunityInfo(
        this.communityId,
        this.communityName.trim(),
        this.communityDescription.trim()
      );

      if (success) {
        const toast = await this.toastCtrl.create({
          message: 'Community updated successfully',
          duration: 2000,
          color: 'success'
        });
        await toast.present();

        // Navigate back to community info
        this.navCtrl.back();
      } else {
        throw new Error('Update failed');
      }

    } catch (error) {
      console.error('Error updating community:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to update community. Please try again.',
        duration: 2000,
        color: 'danger'
      });
      await toast.present();
    } finally {
      loading.dismiss();
    }
  }

  changePhoto() {
    this.toastCtrl.create({
      message: 'Change photo clicked! (Integrate Camera/Gallery here)',
      duration: 2000,
      color: 'primary'
    }).then(t => t.present());
  }
  onBack(){
    this.navCtrl.back();
  }
}