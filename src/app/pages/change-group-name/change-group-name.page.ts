import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController, NavController, ToastController, IonInput } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { get, getDatabase, ref, set } from 'firebase/database';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';
import { EmojiPickerModalComponent } from 'src/app/components/emoji-picker-modal/emoji-picker-modal.component';

export interface GroupMeta {
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
}

@Component({
  selector: 'app-change-group-name',
  standalone: true,
  templateUrl: './change-group-name.page.html',
  styleUrls: ['./change-group-name.page.scss'],
  imports: [IonicModule, FormsModule, CommonModule]
})
export class ChangeGroupNamePage implements OnInit {
  @ViewChild('groupNameInput', { static: false }) groupNameInput!: IonInput;
  
  groupName: string = '';
  groupId: string = '';

  groupMeta: GroupMeta | null = null;

  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private firebaseChatService: FirebaseChatService,
    private modalCtrl: ModalController
  ) {}

  ngOnInit() {
    this.groupId = this.route.snapshot.queryParamMap.get('groupId') || '';
    if (!this.groupId) {
      console.warn('Group ID not provided in query params');
      this.navCtrl.back();
    }
     this.fetchGroupMeta(this.groupId);
  }

    async fetchGroupMeta(groupId: string) {
    const db = getDatabase();
    const groupRef = ref(db, `groups/${groupId}`);
  
    try {
      const snapshot = await get(groupRef);
      if (snapshot.exists()) {
        const groupData = snapshot.val();
  
        this.groupMeta = {
          title:
            groupData.title ||
            groupData.groupName ||
            'Group',
  
          description:
            groupData.description || 'No group description.',
  
          createdBy:
            groupData.createdByName || 'Unknown',
  
          createdAt:
            groupData.createdAt || '',
        };
  
        // (optional) backward compatibility
        this.groupName = this.groupMeta.title;
        // this.groupDescription = this.groupMeta.description;
        // this.groupCreatedBy = this.groupMeta.createdBy;
        // this.groupCreatedAt = this.groupMeta.createdAt;
      }
    } catch (error) {
      console.error('❌ Error fetching group meta:', error);
    }
  }
  

  onCancel() {
    this.navCtrl.back();
  }

  async openEmojiKeyboard() {
    try {
      const modal = await this.modalCtrl.create({
        component: EmojiPickerModalComponent,
        cssClass: 'emoji-picker-modal',
        breakpoints: [0, 0.5, 0.75, 1],
        initialBreakpoint: 0.75,
        backdropDismiss: true,
      });

      await modal.present();

      const { data } = await modal.onDidDismiss();

      if (data && data.selected && data.emoji) {
        console.log('✅ Emoji selected:', data.emoji);
        
        // ✅ Add emoji to the current group name
        // Get cursor position if input is focused, otherwise append at end
        const inputElement = await this.groupNameInput.getInputElement();
        const cursorPosition = inputElement.selectionStart || this.groupName.length;
        
        // Insert emoji at cursor position
        const before = this.groupName.substring(0, cursorPosition);
        const after = this.groupName.substring(cursorPosition);
        this.groupName = before + data.emoji + after;
        
        // Set focus back to input and move cursor after emoji
        setTimeout(async () => {
          await this.groupNameInput.setFocus();
          const newCursorPosition = cursorPosition + data.emoji.length;
          inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
        }, 100);

        console.log('✅ Emoji added to group name:', this.groupName);
      }
    } catch (error) {
      console.error('❌ Error opening emoji picker:', error);
      
      const toast = await this.toastCtrl.create({
        message: 'Failed to open emoji picker',
        duration: 2000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  }

  async onSave() {
    try {
      // ✅ Validate group name
      if (!this.groupName.trim()) {
        const toast = await this.toastCtrl.create({
          message: 'Group name cannot be empty',
          duration: 2000,
          color: 'warning',
          position: 'bottom'
        });
        await toast.present();
        return;
      }

      await this.firebaseChatService.updateGroupName(this.groupId, this.groupName);

      const toast = await this.toastCtrl.create({
        message: 'Group name updated successfully',
        duration: 2000,
        color: 'success',
        position: 'bottom'
      });
      await toast.present();

      this.navCtrl.back();
    } catch (err) {
      console.error('Error updating group name:', err);

      const toast = await this.toastCtrl.create({
        message: 'Failed to update group name',
        duration: 2000,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    }
  }
}