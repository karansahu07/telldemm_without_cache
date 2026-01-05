import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  AlertController,
  LoadingController,
  ToastController,
} from '@ionic/angular';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-select-new-owner',
  templateUrl: './select-new-owner.page.html',
  styleUrls: ['./select-new-owner.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SelectNewOwnerPage implements OnInit {
  communityId: string = '';
  currentUserId: string = '';
  
  // List of admins who can be selected as new owner
  adminMembers: any[] = [];
  
  searchTerm: string = '';
  loading: boolean = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService,
    private service: ApiService,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      this.communityId = params['communityId'] || '';
    });
  }

  async ionViewWillEnter() {
    this.currentUserId = this.authService.authData?.userId || '';
    await this.loadAdmins();
  }

  /**
   * Load all community admins (excluding current owner)
   */
  async loadAdmins() {
    if (!this.communityId) {
      console.error('No community ID provided');
      return;
    }

    this.loading = true;

    try {
      // Get community details
      const community = await this.firebaseService.getCommunityDetails(
        this.communityId
      );

      if (!community) {
        console.error('Community not found');
        this.loading = false;
        return;
      }

      // Check if current user is the owner
      if (community.ownerId !== this.currentUserId) {
        const toast = await this.toastCtrl.create({
          message: 'Only the owner can assign a new owner',
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
        this.navCtrl.back();
        return;
      }

      // Get admin IDs (excluding current owner)
      const adminIds = (community.adminIds || []).filter(
        (id: string) => String(id) !== String(this.currentUserId)
      );

      if (adminIds.length === 0) {
        console.log('No admins found');
        this.adminMembers = [];
        this.loading = false;
        return;
      }

      // Fetch admin profiles
      const adminPromises = adminIds.map(async (adminId: string) => {
        try {
          const userProfile: any = await firstValueFrom(
            this.service.getUserProfilebyId(adminId)
          );

          return {
            user_id: adminId,
            username: userProfile?.name || 'Unknown',
            phone: userProfile?.phone_number || '',
            phoneNumber: userProfile?.phone_number || '',
            avatar: userProfile?.profile || 'assets/images/user.jfif',
            status: userProfile?.dp_status || '',
          };
        } catch (err) {
          console.warn(`Failed to fetch profile for admin ${adminId}`, err);
          return {
            user_id: adminId,
            username: 'Unknown',
            phone: '',
            phoneNumber: '',
            avatar: 'assets/images/user.jfif',
            status: '',
          };
        }
      });

      let fetchedAdmins = await Promise.all(adminPromises);

      // Apply device contact name mapping
      this.adminMembers = await this.adminsWithDeviceNames(fetchedAdmins);

      console.log('Admin members loaded:', this.adminMembers);
    } catch (error) {
      console.error('Error loading admins:', error);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load admins',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Map admins with device contact names
   */
  async adminsWithDeviceNames(admins: any[]): Promise<any[]> {
    try {
      const deviceContacts = this.firebaseService.currentDeviceContacts || [];

      return admins.map((admin) => {
        // Try to find matching device contact by phone number
        const deviceContact = deviceContacts.find((dc) => {
          const adminPhone = (
            admin.phoneNumber ||
            admin.phone ||
            ''
          ).replace(/\D/g, '');
          const dcPhone = (dc.phoneNumber || '').replace(/\D/g, '');

          // Match last 10 digits
          return adminPhone.slice(-10) === dcPhone.slice(-10);
        });

        // If device contact found, use its name; otherwise use phone number
        return {
          ...admin,
          username: deviceContact
            ? deviceContact.username
            : admin.phoneNumber || admin.phone || admin.username,
        };
      });
    } catch (error) {
      console.error('Error mapping admins with device names:', error);
      return admins; // Return original if error
    }
  }

  /**
   * Get filtered admins based on search term
   */
  get filteredAdmins() {
    if (!this.searchTerm || this.searchTerm.trim() === '') {
      return this.adminMembers;
    }

    const term = this.searchTerm.toLowerCase();
    return this.adminMembers.filter(
      (admin) =>
        admin.username?.toLowerCase().includes(term) ||
        admin.phone?.includes(term) ||
        admin.phoneNumber?.includes(term)
    );
  }

  /**
   * Select an admin as new owner
   */
  async selectNewOwner(admin: any) {
    const alert = await this.alertCtrl.create({
      header: 'Assign New Owner',
      message: `Are you sure you want to make ${admin.username} the new owner? You will become an admin and lose owner privileges.`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Confirm',
          role: 'confirm',
          handler: async () => {
            await this.performOwnerTransfer(admin);
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Perform the owner transfer
   */
  async performOwnerTransfer(newOwner: any) {
    const loading = await this.loadingCtrl.create({
      message: 'Transferring ownership...',
      spinner: 'crescent',
    });
    await loading.present();

    try {
      const success = await this.firebaseService.transferCommunityOwnership(
        this.communityId,
        this.currentUserId,
        newOwner.user_id
      );

      await loading.dismiss();

      if (success) {
        const toast = await this.toastCtrl.create({
          message: `${newOwner.username} is now the community owner`,
          duration: 3000,
          color: 'success',
        });
        await toast.present();

        // Navigate back to community info
        this.router.navigate(['/community-info'], {
          queryParams: { communityId: this.communityId },
          replaceUrl: true,
        });
      } else {
        throw new Error('Transfer failed');
      }
    } catch (error) {
      await loading.dismiss();
      console.error('Error transferring ownership:', error);

      const toast = await this.toastCtrl.create({
        message: 'Failed to transfer ownership. Please try again.',
        duration: 3000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  /**
   * Set default avatar on error
   */
  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }

  /**
   * Go back
   */
  goBack() {
    this.navCtrl.back();
  }
}