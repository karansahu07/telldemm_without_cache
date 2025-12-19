import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { ContactSyncService } from 'src/app/services/contact-sync.service'; // adjust if path differs
import { get, child, getDatabase, ref as dbRef, update, ref } from 'firebase/database';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from 'src/app/auth/auth.service';
import { ApiService } from 'src/app/services/api/api.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-add-select-members',
  templateUrl: './add-select-members.page.html',
  styleUrls: ['./add-select-members.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class AddSelectMembersPage implements OnInit {
  searchText = '';
  allUsers: any[] = [];
  filteredContacts: any[] = [];
  isLoading = false;
  groupId: string = '';

  constructor(
    private navCtrl: NavController,
    private contactSyncService: ContactSyncService,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private service : ApiService,
    private firebaseChatService : FirebaseChatService
  ) {}

  ngOnInit() {
    this.loadDeviceMatchedContacts();
    this.groupId = this.route.snapshot.queryParamMap.get('groupId') || '';
  }

  async showToast(message: string, color: 'success' | 'danger' = 'success') {
  const toast = await this.toastCtrl.create({
    message,
    duration: 2000,
    color,
    position: 'bottom'
  });
  toast.present();
}

// async ionViewWillEnter(){
  
// }

async loadDeviceMatchedContacts(): Promise<void> {
  const currentUserPhone = this.authService.authData?.phone_number;
  this.allUsers = [];
  this.isLoading = true;

  try {
    const pfUsers = this.firebaseChatService.currentUsers || [];
    const deviceContacts =
      this.firebaseChatService.currentDeviceContacts || [];

    // ✅ PRESELECTED MEMBERS (from FirebaseChatService)
    const preSelectedMembers =
      this.firebaseChatService.getInitialGroupMembers() || [];

    const preSelectedIds = preSelectedMembers.map(
      (m: any) => String(m.userId ?? m.user_id)
    );

    // Extract platform user phone numbers
    const pfUserPhones = pfUsers.map((pu: any) =>
      String(pu.phoneNumber)
    );

    // Optional: device contacts not on platform
    const nonPfUsers = deviceContacts.filter(
      (dc: any) => !pfUserPhones.includes(String(dc.phoneNumber))
    );

    // ✅ Platform users
    this.allUsers = [
      ...pfUsers.map((u: any) => {
        const uid = String(u.userId ?? u.user_id ?? '');

        return {
          user_id: uid,
          name: u.username ?? u.name ?? u.phoneNumber ?? 'Unknown',
          image: u.avatar ?? u.profile ?? 'assets/images/user.jfif',
          phone_number: String(u.phoneNumber ?? ''),
          isOnPlatform: true,

          // 🔥 KEY CHANGE: preselected support
          selected: preSelectedIds.includes(uid),
        };
      }),
    ];

    // Initialize filtered list for search
    this.filteredContacts = [...this.allUsers];

  } catch (error) {
    console.error('Error loading contacts', error);
  } finally {
    this.isLoading = false;
  }
}



onBack(){
  this.navCtrl.back();
}

//pfUsers

  get selectedUsers() {
    return this.allUsers.filter(user => user.selected);
  }

  toggleSelect(user: any) {
    user.selected = !user.selected;
  }

  filteredUsers() {
    const search = this.searchText.toLowerCase();
    return this.filteredContacts.filter(user =>
      user.name?.toLowerCase().includes(search)
    );
  }

goToCreateGroupPage() {
  const selected = this.selectedUsers;

  if (!selected || selected.length === 0) {
    this.showToast('No members selected', 'danger');
    return;
  }

  this.firebaseChatService.setSelectedGroupMembers(selected);

  this.navCtrl.navigateForward('/select-add-and-create-group');
}


  checkboxChanged(user: any) {
    user.selected = !user.selected;
  }
}