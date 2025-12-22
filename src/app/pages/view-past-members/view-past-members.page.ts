import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';
import { FirebaseChatService } from 'src/app/services/firebase-chat.service';

@Component({
  selector: 'app-view-past-members',
  templateUrl: './view-past-members.page.html',
  styleUrls: ['./view-past-members.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class ViewPastMembersPage implements OnInit {
  groupId: string = '';
  pastMembers: any[] = [];
  isLoading: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private firebaseChatService: FirebaseChatService,
    private navCtrl : NavController
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.groupId = params['groupId'];
      if (this.groupId) {
        this.loadPastMembers();
      }
    });
  }

  async loadPastMembers() {
    try {
      this.isLoading = true;
      this.pastMembers = await this.firebaseChatService.getPastMembers(this.groupId);
      console.log("this past members",this.pastMembers)
    } catch (error) {
      console.error('Error loading past members:', error);
      this.pastMembers = [];
    } finally {
      this.isLoading = false;
    }
  }
  goBack(){
    this.navCtrl.back();
  }
}