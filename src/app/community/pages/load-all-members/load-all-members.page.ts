import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { IonicModule, IonInput, AlertController } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ContactSyncService } from 'src/app/services/contact-sync.service';
import { AuthService } from 'src/app/auth/auth.service';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-load-all-members',
  templateUrl: './load-all-members.page.html',
  styleUrls: ['./load-all-members.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule]
})
export class LoadAllMembersPage implements OnInit {
  @ViewChild('searchInput', { static: false }) searchInput!: IonInput;

  allUsers: any[] = [];
  filteredUsers: any[] = [];
  isLoading = true;

  // search
  showSearchBar = false;
  searchTerm = '';

  // optional community context (read from query params if present)
  communityId: string | null = null;
  communityName: string | null = null;

  constructor(
    private contactSyncService: ContactSyncService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private alertCtrl: AlertController,
    private firebaseChatService: FirebaseChatService
  ) {}

  ngOnInit() {
    // read community params if any
    this.route.queryParams.subscribe(params => {
      this.communityId = params['communityId'] || params['id'] || null;
      this.communityName = params['communityName'] || null;
      // load contacts once params are read
      this.loadDeviceMatchedContacts();
    });
  }

  async loadDeviceMatchedContacts() {
    const currentUserPhone = this.authService.authData?.phone_number;
    this.allUsers = [];
    this.isLoading = true;

    try {
      const pfUsers = this.firebaseChatService.currentUsers || [];
      const currentChatMember = this.firebaseChatService.currentChat?.members;
      console.log({currentChatMember});
      const deviceContacts = this.firebaseChatService.currentDeviceContacts || [];

      // Extract platform user phone numbers for reference
      const pfUserPhones = pfUsers.map((pu: any) => String(pu.phoneNumber));

      // Normalize platform users to match your HTML structure
      // Filter out: 1) current user, 2) existing chat members
      this.allUsers = [
        ...pfUsers
          .filter((u: any) => {
            // Exclude current user
            const userPhone = String(u.phoneNumber ?? '');
            if (currentUserPhone && userPhone === currentUserPhone) return false;

            // Exclude existing chat members
            // const userId = String(u.userId ?? u.user_id ?? '');
            // if (currentChatMember?.includes(userId)) return false;

            return true;
          })
          .map((u: any) => ({
            user_id: String(u.userId ?? u.user_id ?? ''), // backend ID
            name: u.username ?? u.name ?? u.phoneNumber ?? 'Unknown',
            profile: u.avatar ?? u.profile ?? 'assets/images/user.jfif',
            phone_number: String(u.phoneNumber ?? ''),
            bio: u.bio ?? u.status ?? '',
            isOnPlatform: true,
            selected: false,
          })),
      ];

      console.log("all users ", this.allUsers);

      // Initialize filtered list for search
      this.filteredUsers = [...this.allUsers];
    } catch (error) {
      console.error('Error loading contacts', error);
      this.allUsers = [];
      this.filteredUsers = [];
    } finally {
      this.isLoading = false;
    }
  }

  toggleSelect(u: any) {
    u.selected = !u.selected;
    this.reorderList();
  }

  reorderList() {
    const selected = this.filteredUsers.filter(x => x.selected);
    const others = this.filteredUsers.filter(x => !x.selected);
    this.filteredUsers = [...selected, ...others];
  }

  get selectedCount(): number {
    return this.allUsers.filter(u => u.selected).length;
  }

  get selectedMembers() {
    return this.allUsers.filter(u => u.selected);
  }

  toggleSearch() {
    this.showSearchBar = !this.showSearchBar;
    if (!this.showSearchBar) {
      this.searchTerm = '';
      this.filterList();
    } else {
      setTimeout(() => this.searchInput?.setFocus(), 200);
    }
  }

  filterList() {
    const t = (this.searchTerm || '').toLowerCase().trim();
    if (!t) {
      this.filteredUsers = [...this.allUsers];
      this.reorderList();
      return;
    }
    this.filteredUsers = this.allUsers.filter(u =>
      (u.name || '').toLowerCase().includes(t) ||
      (u.bio || '').toLowerCase().includes(t) ||
      (u.phone_number || '').toString().includes(t)
    );
    this.reorderList();
  }

  getInitial(name: string) {
    if (!name || !name.trim()) return '?';
    return name.trim().charAt(0).toUpperCase();
  }

  async confirmSelection() {
    const selected = this.selectedMembers;
    if (!selected || selected.length === 0) {
      const a = await this.alertCtrl.create({
        header: 'No members selected',
        message: 'Please select at least one member to continue.',
        buttons: ['OK']
      });
      await a.present();
      return;
    }

    const communityLabel = this.communityName ? `"${this.communityName}"` : 'this community';
    const msg = `Members will also be added to the community ${communityLabel} and its announcement group.`;

    const alert = await this.alertCtrl.create({
      header: 'Confirm',
      message: msg,
      cssClass: 'confirm-add-members-alert',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Continue',
          handler: () => {
            // ✅ Redirect back to create-new-group page with selected members
            this.router.navigate(['/create-new-group'], {
              state: {
                selectedMembers: selected,
                communityId: this.communityId,
                communityName: this.communityName
              }
            });
          }
        }
      ]
    });

    await alert.present();
  }
}