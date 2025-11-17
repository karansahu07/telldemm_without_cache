import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule, ModalController } from '@ionic/angular';

@Component({
  selector: 'app-channel-privacy-modal',
  templateUrl: './channel-privacy-modal.component.html',
  styleUrls: ['./channel-privacy-modal.component.scss'],
  standalone: true,
  // imports: [CommonModule, IonicModule,RouterModule],
    imports: [IonicModule, CommonModule,FormsModule,RouterModule],

})
export class ChannelPrivacyModalComponent {
  @Input() channel: any;
  constructor(private modalCtrl: ModalController) {}
  close() { this.modalCtrl.dismiss(); }
}
