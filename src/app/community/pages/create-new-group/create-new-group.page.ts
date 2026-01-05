// import { Component, OnInit } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import {
//   IonicModule,
//   NavController,
//   ToastController,
//   LoadingController,
//   AlertController
// } from '@ionic/angular';
// import { FormsModule } from '@angular/forms';
// import { ActivatedRoute, Router } from '@angular/router';
// import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
// import { AuthService } from 'src/app/auth/auth.service';

// @Component({
//   selector: 'app-create-new-group',
//   templateUrl: './create-new-group.page.html',
//   styleUrls: ['./create-new-group.page.scss'],
//   standalone: true,
//   imports: [IonicModule, CommonModule, FormsModule]
// })
// export class CreateNewGroupPage implements OnInit {
//   communityId: string | null = null;
//   communityName: string | null = null;

//   // form fields
//   groupName: string = '';
//   groupDescription: string = '';
//   visibility: 'Visible' | 'Hidden' = 'Visible'; // placeholder
//   permissions: string = 'Members can send messages'; // placeholder

//   // members management (simple single-user default)
//   members: Array<{ userId: string; username: string; phoneNumber: string }> = [];

//   creating = false;

//   constructor(
//     private route: ActivatedRoute,
//     private router: Router,
//     private navCtrl: NavController,
//     private toastCtrl: ToastController,
//     private loadingCtrl: LoadingController,
//     private alertCtrl: AlertController,
//     private firebaseService: FirebaseChatService,
//     private authService: AuthService
//   ) {}

//   ngOnInit() {
//     // read communityId from query params or navigation state
//     this.route.queryParams.subscribe(params => {
//       this.communityId = params['communityId'] || params['id'] || null;
//       if (params['communityName']) this.communityName = params['communityName'];
//     });

//     // pre-fill members with current user as admin
//     const user = this.authService?.authData;
//     const uid = user?.userId ?? null;
//     const name = user?.name ?? 'You';
//     const phone = user?.phone_number ?? '';
//     if (uid) {
//       this.members = [{ userId: uid, username : name, phoneNumber: phone }];
//     }
//      const navState: any = this.router.getCurrentNavigation()?.extras?.state;
//   if (navState?.selectedMembers) {
//     // merge new members with existing ones (avoid duplicates)
//     const newMembers = navState.selectedMembers;
//     newMembers.forEach((m: any) => {
//       if (!this.members.find(existing => existing.userId === m.user_id)) {
//         this.members.push(m);
//       }
//     });
//   }
//   }

//   // optional: open small modal to add more members (very simple alert input)

// //   async addMemberPrompt() {
// //   const alert = await this.alertCtrl.create({
// //     header: 'Add member',
// //     inputs: [
// //       { name: 'id', placeholder: 'User id (backend id)', type: 'text' },
// //       { name: 'name', placeholder: 'Name (optional)', type: 'text' },
// //       { name: 'phone', placeholder: 'Phone (optional)', type: 'text' }
// //     ],
// //     buttons: [
// //       { text: 'Cancel', role: 'cancel' },
// //       {
// //         text: 'Add',
// //         // ⬇️ ensure a boolean is returned on every path
// //         handler: (val: any): boolean => {
// //           if (!val?.id) return false; // keep alert open if empty
// //           this.members.push({
// //             user_id: String(val.id),
// //             name: val.name || undefined,
// //             phone_number: val.phone || undefined
// //           });
// //           return true; // close alert
// //         }
// //       }
// //     ]
// //   });
// //   await alert.present();
// // }

// async addMemberPrompt() {
//   // Navigate to load-all-members page instead of showing alert
//   this.navCtrl.navigateForward(['/load-all-members'], {
//     state: {
//       // pass already selected members so they stay preselected
//       selected: this.members,
//       communityId: this.communityId,
//       communityName: this.communityName
//     }
//   });
// }



//   removeMember(idx: number) {
//     this.members.splice(idx, 1);
//   }

//   // Called when user taps FAB to create group and link into community
//   async createGroupAndLink() {
//     if (!this.groupName || this.groupName.trim().length === 0) {
//       const t = await this.toastCtrl.create({ message: 'Enter group name', duration: 1500, color: 'warning' });
//       await t.present();
//       return;
//     }

//     if (!this.communityId) {
//       const t = await this.toastCtrl.create({ message: 'Community not selected', duration: 2000, color: 'danger' });
//       await t.present();
//       return;
//     }

//     const user = this.authService?.authData;
//     const userId = user?.userId ?? null;
//     if (!userId) {
//       const t = await this.toastCtrl.create({ message: 'User not authenticated', duration: 2000, color: 'danger' });
//       await t.present();
//       return;
//     }

//     this.creating = true;
//     const loading = await this.loadingCtrl.create({ message: 'Creating group...' });
//     await loading.present();

//     try {
//       // create id
//       const groupId = `group_${Date.now()}`;

//       // create group node using service
//       await this.firebaseService.createGroup({groupId, groupName : this.groupName.trim(), members : this.members});

//       // Prepare multi-path updates to link group with community and user index
//       const updates: any = {};
//       updates[`/communities/${this.communityId}/groups/${groupId}`] = true;
//       updates[`/groups/${groupId}/communityId`] = this.communityId;
//       updates[`/users/${userId}/groups/${groupId}`] = true;
//       // ensure community members mapping exists
//       updates[`/communities/${this.communityId}/members/${userId}`] = true;

//       if (typeof (this.firebaseService as any).bulkUpdate === 'function') {
//         await (this.firebaseService as any).bulkUpdate(updates);
//       } else if (typeof (this.firebaseService as any).setPath === 'function') {
//         const promises = Object.keys(updates).map(p => (this.firebaseService as any).setPath(p, updates[p]));
//         await Promise.all(promises);
//       } else {
//         throw new Error('bulkUpdate or setPath helper not found on FirebaseChatService');
//       }

//       // Add user to community (counts etc). Passing false so it doesn't auto-join General (you already created mapping).
//       try {
//         // await this.firebaseService.addUserToCommunity(userId, this.communityId, false);
//       } catch (e) {
//         // non-fatal; mapping already applied above
//         console.warn('addUserToCommunity non-fatal error', e);
//       }

//       await loading.dismiss();
//       this.creating = false;

//       const toast = await this.toastCtrl.create({ message: 'Group created and linked to community', duration: 2000, color: 'success' });
//       await toast.present();

//       // navigate back to community detail (or community page)
//       // pass communityId so detail page can refresh
//       this.navCtrl.navigateBack(['/community-detail'], { queryParams: { communityId: this.communityId } });
//     } catch (err: any) {
//       console.error('createGroupAndLink failed', err);
//       await loading.dismiss();
//       this.creating = false;
//       const t = await this.toastCtrl.create({
//         message: 'Failed to create group: ' + (err?.message || err?.code || ''),
//         duration: 4000,
//         color: 'danger'
//       });
//       await t.present();
//     }
//   }
// }


import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  NavController,
  ToastController,
  LoadingController,
  AlertController
} from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-create-new-group',
  templateUrl: './create-new-group.page.html',
  styleUrls: ['./create-new-group.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class CreateNewGroupPage implements OnInit {
  communityId: string | null = null;
  communityName: string | null = null;

  // form fields
  groupName: string = '';
  groupDescription: string = '';
  visibility: 'Visible' | 'Hidden' = 'Visible';
  permissions: string = 'Members can send messages';

  // members management
  members: Array<{ userId: string; username: string; phoneNumber: string, profile?: string; }> = [];

  creating = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private loadingCtrl: LoadingController,
    private alertCtrl: AlertController,
    private firebaseService: FirebaseChatService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // ✅ Strategy 1: Try to read from multiple sources
    this.loadCommunityContext();
    
    // Pre-fill members with current user
    const user = this.authService?.authData;
    const uid = user?.userId ?? null;
    const name = user?.name ?? 'You';
    const phone = user?.phone_number ?? '';
    if (uid) {
      this.members = [{ userId: uid, username: name, phoneNumber: phone }];
    }

    // Load selected members from service
    const savedMembers = this.firebaseService.getSelectedGroupMembers();
    
    if (savedMembers && savedMembers.length > 0) {
      console.log(`📥 Retrieved ${savedMembers.length} members from service`);
      
      savedMembers.forEach((m: any) => {
        const memberId = m.user_id || m.userId;
        if (!this.members.find(existing => existing.userId === memberId)) {
          this.members.push({
            userId: memberId,
            username: m.name || m.username || 'Unknown',
            phoneNumber: m.phone_number || m.phoneNumber || ''
          });
        }
      });
      
      console.log(`✅ Total members after service merge: ${this.members.length}`);
    }

    // Check router state for selected members
    const navState: any = this.router.getCurrentNavigation()?.extras?.state;
    if (navState?.selectedMembers) {
      console.log(`📥 Retrieved ${navState.selectedMembers.length} members from router state`);
      
      const newMembers = navState.selectedMembers;
      newMembers.forEach((m: any) => {
        const memberId = m.user_id || m.userId;
        if (!this.members.find(existing => existing.userId === memberId)) {
          this.members.push({
            userId: memberId,
            username: m.name || m.username || 'Unknown',
            phoneNumber: m.phone_number || m.phoneNumber || ''
          });
        }
      });
    }

    console.log('📊 Final members list:', this.members);
  }

  // ✅ New method to load community context from multiple sources
  private loadCommunityContext() {
    console.log('🔍 Loading community context...');
    
    // Source 1: Router state (highest priority - most recent)
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state;
    
    if (state?.['communityId']) {
      this.communityId = state['communityId'];
      this.communityName = state['communityName'] || null;
      console.log('✅ Loaded from router state:', this.communityId);
      
      // Save to service for future use
      this.firebaseService.setCurrentCommunityContext({
        communityId: this.communityId,
        communityName: this.communityName
      });
      return;
    }

    // Source 2: Query params snapshot
    const params = this.route.snapshot.queryParams;
    if (params['communityId'] || params['id']) {
      this.communityId = params['communityId'] || params['id'];
      this.communityName = params['communityName'] || null;
      console.log('✅ Loaded from query params:', this.communityId);
      
      // Save to service for future use
      this.firebaseService.setCurrentCommunityContext({
        communityId: this.communityId,
        communityName: this.communityName
      });
      return;
    }

    // Source 3: Firebase service (saved from previous navigation)
    const savedContext = this.firebaseService.getCurrentCommunityContext();
    if (savedContext?.communityId) {
      this.communityId = savedContext.communityId;
      this.communityName = savedContext.communityName || null;
      console.log('✅ Loaded from service:', this.communityId);
      return;
    }

    // Source 4: Subscribe to query params (async fallback)
    this.route.queryParams.subscribe(params => {
      if (!this.communityId && (params['communityId'] || params['id'])) {
        this.communityId = params['communityId'] || params['id'];
        this.communityName = params['communityName'] || null;
        console.log('✅ Loaded from query params subscription:', this.communityId);
        
        // Save to service
        this.firebaseService.setCurrentCommunityContext({
          communityId: this.communityId,
          communityName: this.communityName
        });
      }
    });

    console.log('🔍 Final communityId:', this.communityId);
  }

  ionViewWillEnter() {
    console.log('🔄 ionViewWillEnter called');
    
    // Reload community context if not set
    if (!this.communityId) {
      this.loadCommunityContext();
    }

    // Get updated members from service
    const savedMembers = this.firebaseService.getSelectedGroupMembers();
    
    if (savedMembers && savedMembers.length > 0) {
      console.log(`🔄 Refreshing members: ${savedMembers.length} from service`);
      
      // Clear existing members except current user
      const currentUserId = this.authService?.authData?.userId;
      this.members = this.members.filter(m => m.userId === currentUserId);
      
      // Add all saved members
      savedMembers.forEach((m: any) => {
        const memberId = m.user_id || m.userId;
        if (!this.members.find(existing => existing.userId === memberId)) {
          this.members.push({
            userId: memberId,
            username: m.name || m.username || 'Unknown',
            phoneNumber: m.phone_number || m.phoneNumber || '',
            profile: m.profile || m.avatar || ''
          });
        }
      });
      
      console.log(`✅ Members refreshed. Total: ${this.members.length}`);
    }
  }

  async addMemberPrompt() {
    // ✅ Save current community context before navigation
    if (this.communityId) {
      this.firebaseService.setCurrentCommunityContext({
        communityId: this.communityId,
        communityName: this.communityName
      });
    }

    // Navigate to load-all-members page
    this.navCtrl.navigateForward(['/load-all-members'], {
      queryParams: {
        communityId: this.communityId,
        communityName: this.communityName
      },
      state: {
        selected: this.members,
        communityId: this.communityId,
        communityName: this.communityName
      }
    });
  }

  removeMember(idx: number) {
    this.members.splice(idx, 1);
    
    // Update service after removing member
    const remainingMembers = this.members
      .filter(m => m.userId !== this.authService?.authData?.userId)
      .map(m => ({
        user_id: m.userId,
        name: m.username,
        phone_number: m.phoneNumber
      }));
    
    this.firebaseService.setSelectedGroupMembers(remainingMembers);
    console.log('✅ Member removed. Updated service with remaining members');
  }

  async createGroupAndLink() {
    console.log('🔍 createGroupAndLink called');
    console.log('🔍 Current communityId:', this.communityId);
    console.log('🔍 Current communityName:', this.communityName);
    console.log('🔍 Current URL:', this.router.url);
    
    if (!this.groupName || this.groupName.trim().length === 0) {
      const t = await this.toastCtrl.create({ 
        message: 'Enter group name', 
        duration: 1500, 
        color: 'warning' 
      });
      await t.present();
      return;
    }

    // ✅ Multiple attempts to get communityId
    if (!this.communityId) {
      console.error('❌ communityId is null! Attempting recovery...');
      
      // Attempt 1: Load from service
      const savedContext = this.firebaseService.getCurrentCommunityContext();
      if (savedContext?.communityId) {
        this.communityId = savedContext.communityId;
        this.communityName = savedContext.communityName;
        console.log('✅ Recovered from service:', this.communityId);
      }
      
      // Attempt 2: Query params snapshot
      if (!this.communityId) {
        const params = this.route.snapshot.queryParams;
        this.communityId = params['communityId'] || params['id'] || null;
        this.communityName = params['communityName'] || null;
        console.log('🔍 Attempted snapshot read:', this.communityId);
      }
      
      // Attempt 3: Parse URL manually
      if (!this.communityId) {
        const url = this.router.url;
        const match = url.match(/[?&]communityId=([^&]+)/);
        if (match) {
          this.communityId = match[1];
          console.log('✅ Parsed from URL:', this.communityId);
        }
      }
      
      // Final check
      if (!this.communityId) {
        console.error('❌ Failed to recover communityId from all sources');
        const t = await this.toastCtrl.create({ 
          message: 'Community context lost. Please go back and try again.', 
          duration: 3000, 
          color: 'danger' 
        });
        await t.present();
        return;
      }
    }

    const user = this.authService?.authData;
    const userId = user?.userId ?? null;
    if (!userId) {
      const t = await this.toastCtrl.create({ 
        message: 'User not authenticated', 
        duration: 2000, 
        color: 'danger' 
      });
      await t.present();
      return;
    }

    this.creating = true;
    const loading = await this.loadingCtrl.create({ message: 'Creating group...' });
    await loading.present();

    try {
      console.log('✅ All validations passed. Creating group...');
      console.log('✅ Using communityId:', this.communityId);
      
      // create id
      const groupId = `group_${Date.now()}`;

      // create group node using service
      await this.firebaseService.createGroup({
        groupId, 
        groupName: this.groupName.trim(), 
        members: this.members
      });

      // Prepare multi-path updates to link group with community and user index
      const updates: any = {};
      updates[`/communities/${this.communityId}/groups/${groupId}`] = true;
      updates[`/groups/${groupId}/communityId`] = this.communityId;
      updates[`/users/${userId}/groups/${groupId}`] = true;
      updates[`/communities/${this.communityId}/members/${userId}`] = true;

      if (typeof (this.firebaseService as any).bulkUpdate === 'function') {
        await (this.firebaseService as any).bulkUpdate(updates);
      } else if (typeof (this.firebaseService as any).setPath === 'function') {
        const promises = Object.keys(updates).map(p => 
          (this.firebaseService as any).setPath(p, updates[p])
        );
        await Promise.all(promises);
      } else {
        throw new Error('bulkUpdate or setPath helper not found on FirebaseChatService');
      }

      await loading.dismiss();
      this.creating = false;

      // Clear selected members and community context from service
      this.firebaseService.clearSelectedGroupMembers();
      this.firebaseService.clearCurrentCommunityContext();
      console.log('✅ Cleared service data after group creation');

      const toast = await this.toastCtrl.create({ 
        message: 'Group created and linked to community', 
        duration: 2000, 
        color: 'success' 
      });
      await toast.present();

      // navigate back to community detail
      this.navCtrl.navigateBack(['/community-detail'], { 
        queryParams: { communityId: this.communityId } 
      });
    } catch (err: any) {
      console.error('createGroupAndLink failed', err);
      await loading.dismiss();
      this.creating = false;
      const t = await this.toastCtrl.create({
        message: 'Failed to create group: ' + (err?.message || err?.code || ''),
        duration: 4000,
        color: 'danger'
      });
      await t.present();
    }
  }

  ionViewWillLeave() {
    // Don't clear context if creating - let it persist
    if (!this.creating) {
      // Context will be cleared after successful creation
      // or persist for back navigation
    }
  }
  onImgError(event: Event) {
  const img = event.target as HTMLImageElement;
  img.src = 'assets/images/user.jfif';
}

}