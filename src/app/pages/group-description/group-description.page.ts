import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule, NavController } from '@ionic/angular';
import { getDatabase, ref, update } from 'firebase/database';

@Component({
  selector: 'app-group-description',
  templateUrl: './group-description.page.html',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
})
export class GroupDescriptionPage {
  groupId: string = '';
  description: string = '';
  receiverId: string = '';
  receiver_phone: string = '';
  receiver_name: string = '';
  isGroup: boolean = false;
  chatType = "";

  constructor(
    private route: ActivatedRoute,
     private router: Router,
     private navCtrl: NavController,
    ) {
    
  }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.groupId = params['receiverId'];
      console.log("group Id is ",this.groupId)
      //console.log("this.groupId",this.groupId);
      // this.description = params['currentDescription'] || '';
      // this.receiverId = params['receiverId'] || '';
      // this.receiver_phone = params['receiver_phone'] || '';
      // this.receiver_name = params['receiver_name'] || '';
      // this.isGroup = params['isGroup'] === 'true';
      this.isGroup = params['isGroup'] === true;
    // //console.log("params['isGroup'] === true",params['isGroup']);

      this.chatType = this.isGroup ? 'group' : 'private';
    });
  }


async saveDescription() {
  //console.log("this button is clicked", this.groupId);
  if (!this.groupId) return;

  try {
    const db = getDatabase();
    const groupRef = ref(db, `groups/${this.groupId}`);
    await update(groupRef, { description: this.description });

    // ✅ Correct Query Params for /profile-screen
    this.router.navigate(['/profile-screen'], {
      queryParams: {
        receiverId: this.groupId,
        // receiver_phone: this.receiver_phone || '',
        // receiver_name: this.receiver_name,
        isGroup: this.isGroup,
        // currentDescription: this.description
      }
    });

  } catch (error) {
    console.error("Error updating description:", error);
  }
}


  async cancel() {
    try {
      this.navCtrl.back();
    } catch (err) {
      console.warn('navCtrl.back() failed, fallback:', err);
    }
  }
}