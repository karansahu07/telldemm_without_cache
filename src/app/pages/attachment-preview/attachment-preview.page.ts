import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonicModule, NavController } from '@ionic/angular';
import { ActivatedRoute } from '@angular/router';
import { SecureStorageService } from 'src/app/services/secure-storage/secure-storage.service';

@Component({
  selector: 'app-attachment-preview',
  templateUrl: './attachment-preview.page.html',
  styleUrls: ['./attachment-preview.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class AttachmentPreviewPage {
  imageData: string = '';
  receiverId: string | null = null;
  receiverPhone: string | null = null;
  receiver_name: string = '';


  constructor(
    private navCtrl: NavController,
    private route: ActivatedRoute,
    private secureStorage: SecureStorageService
  ) {
    // Get image from navigation state
    if (history.state.imageData) {
      this.imageData = history.state.imageData;
    }

    

    // Get query parameters
    this.route.queryParams.subscribe(params => {
      this.receiverId = params['receiverId'] || null;
      this.receiverPhone = params['receiver_phone'] || null;
    });
  }

  async ngOnInit() {
    this.receiver_name = (await this.secureStorage.getItem('receiver_name')) || '';
  }

  // send() {
  //   // Optionally push state back to history if needed
  //   history.pushState({ imageToSend: this.imageData }, '');

  //   // Navigate back while keeping the same query params
  //   this.navCtrl.navigateBack(`/chatting-screen?receiverId=${this.receiverId}&receiver_phone=${this.receiverPhone}`);
  // }

  send() {
    //console.log("image data: clicked here dgjndfgd");
  this.navCtrl.navigateBack(`/chatting-screen?receiverId=${this.receiverId}&receiver_phone=${this.receiverPhone}`, {
    state: { imageToSend: this.imageData }
  });
  //console.log("image data:", this.imageData);
}


  cancel() {
    this.navCtrl.navigateBack(`/chatting-screen?receiverId=${this.receiverId}&receiver_phone=${this.receiverPhone}`);
  }
}
