import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  IonContent,
  NavController,
  IonRouterOutlet,
  ToastController,
} from '@ionic/angular';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';
import { firstValueFrom } from 'rxjs';
import { ApiService } from 'src/app/services/api/api.service';

@Component({
  selector: 'app-community-info',
  templateUrl: './community-info.page.html',
  styleUrls: ['./community-info.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class CommunityInfoPage implements OnInit {
  @ViewChild(IonContent, { static: true }) content!: IonContent;

  communityId: string | null = null;
  communityName: string | null = null;
  memberCount = 0;
  groupCount = 0;
  isScrolled: boolean = false;
  chatTitle = 'Test';
   currentUserId: string = '';
   isCreator : boolean = false;
   loading = false;

  communityMembers: any[] = [];
  adminIds: string[] = [];

  activeSection: 'community' | 'announcements' = 'community';

  community: any = {
    name: '',
    icon: '',
    description:
      'Hi everyone! This community is for members to chat in topic-based groups and get important announcements.',
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private navCtrl: NavController,
    private firebaseService : FirebaseChatService,
    private authService: AuthService,
    private toastCtrl: ToastController,
    private service : ApiService
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['communityId'] || '';
      this.communityId = cid;
      console.log("community id is", this.communityId)
    });
  }

  ionViewWillEnter() {
    this.route.queryParams.subscribe((params) => {
      const cid = params['communityId'] || '';
      this.communityId = cid;
       console.log("community id is", this.communityId)
    });

    this.currentUserId = this.authService?.authData?.userId || '';
    const allGroups = this.firebaseService.currentConversations.filter(
        (c) => c.type === 'group' && c.communityId === this.communityId
      );
      this.groupCount = allGroups.length;
      // this.isCreator = this.community.createdBy === this.currentUserId;
      // console.log("this is creator ", this.isCreator)
      this.loadCommunityDetail();
  }

//     async loadCommunityDetail() {
//   if (!this.communityId) return;
//   this.loading = true;

//   try {
//     // Fetch community details from Firebase
//     this.community = await this.firebaseService.getCommunityDetails(
//       this.communityId
//     );
//     console.log('Community details:', this.community);

//     if (!this.community) {
//       this.memberCount = 0;
//       this.groupCount = 0;
//       this.loading = false;
//       return;
//     }

//     // ✅ CHECK IF CURRENT USER IS THE CREATOR
//     this.isCreator = this.community.createdBy === this.currentUserId;
//     console.log('Is Creator:', this.isCreator, 'Created By:', this.community.createdBy, 'Current User:', this.currentUserId);

//     // Get member count
//     this.memberCount = Object.keys(this.community.members || {}).length;

//     // Sync groups with Firebase
//     // await this.syncGroupsWithFirebase();
//   } catch (err) {
//     console.error('loadCommunityDetail error', err);
//     const toast = await this.toastCtrl.create({
//       message: 'Failed to load community details',
//       duration: 2000,
//       color: 'danger',
//     });
//     await toast.present();
//   } finally {
//     this.loading = false;
//   }
// }

async loadCommunityDetail() {
    if (!this.communityId) return;
    this.loading = true;

    try {
      // Fetch community details from Firebase
      this.community = await this.firebaseService.getCommunityDetails(
        this.communityId
      );
      console.log('Community details:', this.community);

      if (!this.community) {
        this.memberCount = 0;
        this.groupCount = 0;
        this.communityMembers = []; // 👈 Reset members
        this.loading = false;
        return;
      }

      // ✅ CHECK IF CURRENT USER IS THE CREATOR
      this.isCreator = this.community.createdBy === this.currentUserId;
      console.log('Is Creator:', this.isCreator, 'Created By:', this.community.createdBy, 'Current User:', this.currentUserId);

      // Get admin IDs
      this.adminIds = this.community.adminIds || [];

      // Get member count
      this.memberCount = Object.keys(this.community.members || {}).length;

      // 👇 Fetch member details with profiles
      await this.fetchCommunityMembersWithProfiles();

    } catch (err) {
      console.error('loadCommunityDetail error', err);
      const toast = await this.toastCtrl.create({
        message: 'Failed to load community details',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    } finally {
      this.loading = false;
    }
  }

  // 👇 New method - similar to userabout's fetchGroupWithProfiles
 async fetchCommunityMembersWithProfiles() {
  if (!this.community?.members) {
    this.communityMembers = [];
    return;
  }

  const members = this.community.members || {};
  console.log({members})
  const memberIds = Object.keys(members);
  console.log({memberIds})
  const creatorId = this.community.createdBy;
  console.log({creatorId})

  const memberPromises = memberIds.map(async (userId) => {
    const memberData = members[userId];
    console.log({memberData})
    
    try {
      const userProfileRes: any = await firstValueFrom(
        this.service.getUserProfilebyId(userId)
      );
      console.log({userProfileRes});

      return {
        user_id: userId,
        username: userProfileRes?.name || 'Unknown',
        phone: userProfileRes?.phone_number || '',
        avatar: userProfileRes?.profile || 'assets/images/user.jfif',
        isActive: memberData.isActive ?? true,
        isCreator: userId === creatorId,
        status : userProfileRes.dp_status,
      };
    } catch (err) {
      console.warn(`Failed to fetch profile for user ${userId}`, err);
      
      return {
        user_id: userId,
        username: memberData.username || 'Unknown',
        phone: memberData.phoneNumber || '',
        avatar: 'assets/images/user.jfif',
        isActive: memberData.isActive ?? true,
        isCreator: userId === creatorId,
      };
    }
  });

  this.communityMembers = await Promise.all(memberPromises);
  this.communityMembers = this.communityMembers.filter(m => m.isActive !== false);

  console.log('Community members with profiles:', this.communityMembers);
}

  // Helper method to check if user is admin
  isAdmin(userId: string): boolean {
    return this.adminIds.includes(String(userId));
  }

  onScroll(event: any) {
    const scrollTop = event.detail.scrollTop;
    this.isScrolled = scrollTop > 10;
  }
  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }
  goBackToChat(){
    // this.navCtrl.back();
    if(!this.communityId) return;
    this.router.navigate(['/community-detail'], {
      queryParams: {
        communityId: this.communityId,
      }
    });
  }

   setActiveSection(section: 'community' | 'announcements') {
    this.activeSection = section;
  }

  onAddGroups() {
    if(!this.communityId) return;
    this.router.navigate(['/add-group-community'], {
      queryParams: {
        communityId: this.communityId,
      }
    });
  }

  async scrollToSegment(seg: 'community' | 'announcements') {
    await new Promise((r) => setTimeout(r, 80));
    const elId = seg === 'community' ? 'section-community' : 'section-announcements';
    const el = document.getElementById(elId);
    if (!el) {
      await this.content.scrollToTop(300);
      return;
    }
    const top = el.offsetTop;
    await this.content.scrollToPoint(0, top, 300);
  }

  invite() {
    // navigate to invite page or call share link
    //console.log('invite');
    // this.router.navigate(['/community-invite'], { queryParams: { communityId: this.communityId }});
  }

addMembers() {
    this.router.navigate(['/add-members-community'], {
      queryParams: {
        communityId: this.communityId,
      }
    });
  }

  addGroups() {
    // go to add-existing-groups, pass communityId
    this.router.navigate(['/add-existing-groups'], {
      queryParams: { communityId: this.communityId, communityName: this.communityName },
    });
  }

  // menu actions for community options
  editCommunity() {
    this.router.navigate(['/edit-community-info'], {
      queryParams: { communityId: this.communityId },
    });
  }

  communitySettings() {
    //console.log('open community settings');
  }
  viewGroups() {
    this.router.navigate(['/add-group-community'], {
      queryParams: { communityId: this.communityId },
    });
  }
  assignNewOwner() {
    //console.log('assign owner');
  }
  exitCommunity() {
    //console.log('exit community');
  }
  reportCommunity() {
    //console.log('report community');
  }
  deactivateCommunity() {
    //console.log('deactivate community');
  }

  // announcement-section actions
  notifications() {
    //console.log('notifications');
  }
  mediaVisibility() {
    //console.log('media visibility');
  }
  disappearingMessages() {
    //console.log('disappearing messages');
  }
  chatLock() {
    //console.log('chat lock');
  }
  phoneNumberPrivacy() {
    //console.log('phone privacy');
  }

  // go back
  back() {
    this.navCtrl.back();
  }
}