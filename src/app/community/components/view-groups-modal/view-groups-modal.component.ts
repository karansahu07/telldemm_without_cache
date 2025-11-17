import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';

interface CommunityGroup {
  roomId?: string;
  id?: string;
  title?: string;
  name?: string;
  description?: string;
  avatar?: string;
  membersCount?: number;
  isMember?: boolean;
  lastMessage?: string;
  updatedAt?: Date;
  members?: string[];
}

@Component({
  selector: 'app-view-groups-modal',
  templateUrl: './view-groups-modal.component.html',
  styleUrls: ['./view-groups-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class ViewGroupsModalComponent implements OnInit {
  @Input() communityId: string = '';
  @Input() communityName: string = '';
  @Input() announcementGroup: CommunityGroup | null = null;
  @Input() generalGroup: CommunityGroup | null = null;
  @Input() groupsIn: CommunityGroup[] = [];
  @Input() groupsAvailable: CommunityGroup[] = [];
  @Input() isCreator: boolean = false;

  allGroups: CommunityGroup[] = [];

  constructor(
    private modalCtrl: ModalController,
    private router: Router
  ) {}

  ngOnInit() {
    console.log('Modal opened with data:', {
      communityId: this.communityId,
      communityName: this.communityName,
      announcementGroup: this.announcementGroup,
      generalGroup: this.generalGroup,
      groupsIn: this.groupsIn,
      groupsAvailable: this.groupsAvailable,
      isCreator: this.isCreator,
    });

    // Combine all groups in order
    this.allGroups = [];
    
    if (this.announcementGroup) {
      this.allGroups.push(this.announcementGroup);
    }
    
    if (this.groupsIn && this.groupsIn.length > 0) {
      this.allGroups.push(...this.groupsIn);
    }
    
    if (this.generalGroup) {
      this.allGroups.push(this.generalGroup);
    }
    
    if (this.groupsAvailable && this.groupsAvailable.length > 0) {
      this.allGroups.push(...this.groupsAvailable);
    }
  }

  dismiss() {
    this.modalCtrl.dismiss();
  }

  openGroup(group: CommunityGroup) {
    const groupId = group.roomId || group.id;
    const groupName = group.title || group.name;
    
    console.log('Opening group:', { groupId, groupName, isMember: group.isMember });
    
    // Dismiss modal and pass data back
    this.modalCtrl.dismiss({
      action: 'openGroup',
      groupId: groupId,
      groupName: groupName,
      isMember: group.isMember
    });
  }

  addGroup() {
    console.log('Add group clicked');
    // Dismiss modal and navigate to add group page
    this.modalCtrl.dismiss({
      action: 'addGroup'
    });
  }

  getGroupName(group: CommunityGroup): string {
    return group.title || group.name || 'Unnamed Group';
  }

  getGroupId(group: CommunityGroup): string {
    return group.roomId || group.id || '';
  }

  formatDate(date: Date | undefined): string {
    if (!date) return '';
    
    const now = new Date();
    const groupDate = new Date(date);
    const diffTime = Math.abs(now.getTime() - groupDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      const month = groupDate.getMonth() + 1;
      const day = groupDate.getDate();
      const year = groupDate.getFullYear().toString().slice(-2);
      return `${month}/${day}/${year}`;
    }
  }

  setDefaultAvatar(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/user.jfif';
  }
}