import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, NavController } from '@ionic/angular';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { get, getDatabase, ref, update } from 'firebase/database';
import { ActivatedRoute } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { AuthService } from 'src/app/auth/auth.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-add-members-community',
  templateUrl: './add-members-community.page.html',
  styleUrls: ['./add-members-community.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AddMembersCommunityPage implements OnInit {
  searchText = '';
  allUsers: any[] = [];
  filteredContacts: any[] = [];
  isLoading = false;
  communityId: string = '';

  constructor(
    private navCtrl: NavController,
    private contactSyncService: ContactSyncService,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private authService: AuthService,
    private firebaseChatService: FirebaseChatService
  ) {}

  ngOnInit() {
    this.loadDeviceMatchedContacts();
    this.communityId = this.route.snapshot.queryParamMap.get('communityId') || '';
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

  async loadDeviceMatchedContacts(): Promise<void> {
    const currentUserPhone = this.authService.authData?.phone_number;
    this.allUsers = [];
    this.isLoading = true;

    try {
      const pfUsers = this.firebaseChatService.currentUsers || [];
      const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

      const pfUserPhones = pfUsers.map((pu: any) => String(pu.phoneNumber));

      const nonPfUsers = deviceContacts.filter(
        (dc: any) => !pfUserPhones.includes(String(dc.phoneNumber))
      );

      this.allUsers = [
        ...pfUsers.map((u: any) => ({
          user_id: String(u.userId ?? u.user_id ?? ''),
          name: u.username ?? u.name ?? u.phoneNumber ?? 'Unknown',
          image: u.avatar ?? u.profile ?? 'assets/images/user.jfif',
          phone_number: String(u.phoneNumber ?? ''),
          isOnPlatform: true,
          selected: false,
        })),
      ];

      this.filteredContacts = [...this.allUsers];
    } catch (error) {
      console.error('Error loading contacts', error);
    } finally {
      this.isLoading = false;
    }
  }

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

  async addSelectedMembers() {
    if (!this.communityId) {
      this.showToast('Community ID not found', 'danger');
      return;
    }

    const selected = this.selectedUsers;
    if (!selected || selected.length === 0) {
      this.showToast('No members selected', 'danger');
      return;
    }

    const userIds: string[] = selected
      .map((u: any) => u.user_id ?? u.userId)
      .filter(Boolean)
      .map((id: any) => String(id));

    if (userIds.length === 0) {
      this.showToast('No valid user ids found', 'danger');
      return;
    }

    this.isLoading = true;
    try {
      await this.firebaseChatService.addMembersToCommunity(this.communityId, userIds);
      this.showToast('Members added successfully 🎉', 'success');
      this.navCtrl.back();
    } catch (err) {
      console.error('Error adding members', err);
      this.showToast('Error adding members', 'danger');
    } finally {
      this.isLoading = false;
    }
  }

  checkboxChanged(user: any) {
    user.selected = !user.selected;
  }
}