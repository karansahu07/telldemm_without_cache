// add-channel-modal.component.ts
import { Component, OnInit } from '@angular/core';
import { IonicModule, ModalController, LoadingController, ToastController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { ChannelService, Category, Region } from '../../services/channel';
import { AuthService } from 'src/app/auth/auth.service';

@Component({
  selector: 'app-add-channel-modal',
  templateUrl: './add-channel-modal.component.html',
  styleUrls: ['./add-channel-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class AddChannelModalComponent implements OnInit {

  /* Form fields */
  channel_name = '';
  description = '';
  is_public = 1;
  max_members?: number | null = null;
  category_id?: number | null = null;
  region_id?: number | null = null;
  created_by?: number | null = null;
  submitted?: boolean = false;

  /* File upload */
  selectedFile?: File | null = null;
  previewUrl?: string | null = null;

  /* Metadata */
  categories: Category[] = [];
  regions: Region[] = [];

  loading = false;

  constructor(
    private modalCtrl: ModalController,
    private channelService: ChannelService,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private authService:AuthService
  ) { }

  ngOnInit(): void {
    this.loadMetadata();
  }

  /* Load categories + regions quickly */
  loadMetadata() {
    this.channelService.getAllCategories().subscribe({
      next: (res) => this.categories = res?.categories || [],
      error: () => this.categories = []
    });

    this.channelService.getAllRegions().subscribe({
      next: (res) => this.regions = res?.regions || [],
      error: () => this.regions = []
    });
  }

  /* Handle file input */
  onFileSelected(event: any) {
    const file = event.target.files[0];
    this.selectedFile = file;

    if (file) {
      const reader = new FileReader();
      reader.onload = () => this.previewUrl = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  dismiss(result?: any) {
    this.modalCtrl.dismiss(result);
  }

  async presentToast(message: string, duration = 2000) {
    const t = await this.toastCtrl.create({ message, duration, position: 'bottom' });
    await t.present();
  }


async submit() {
  this.submitted = true;

  const name = (this.channel_name || '').trim();
  const desc = (this.description || '').trim();

  if (!name) return this.presentToast("Channel name is required");
  if (!desc) return this.presentToast("Description is required");

  // if (this.is_public) {
  //   return this.presentToast("Please select visibility");
  // }

    // is_public can be 0 or 1; ensure it's defined
    if (this.is_public !== 0 && !this.is_public && this.is_public !== 0) {
      this.presentToast("Please select visibility (Public or Private)");
      return;
    }

  if (!this.category_id) return this.presentToast("Please select a category");
  if (!this.region_id) return this.presentToast("Please select a region");

  // const createdById = 52;
  const createdById = this.authService.authData?.userId || '';;


  const loader = await this.loadingCtrl.create({
    message: "Creating channel..."
  });
  await loader.present();

  try {
    const form = new FormData();

    // ⭐ REQUIRED
    form.append("channel_name", name);
    form.append("description", desc);
    form.append("is_public", String(this.is_public));
    form.append("created_by", String(createdById));
    form.append("firebase_channel_id", `firebase_${Date.now()}`);

    // ⭐ NEW: send IDs (not names)
    form.append("category_id", String(this.category_id));
    form.append("region_id", String(this.region_id));

    // optional
    if (this.max_members) {
      form.append("max_members", String(this.max_members));
    }

    // image
    if (this.selectedFile) {
      form.append("channel_dp", this.selectedFile, this.selectedFile.name);
    }

    // debug
    form.forEach((value, key) => console.log(key, value));

    this.channelService.createChannelMultipart(form)
      .pipe(finalize(() => loader.dismiss()))
      .subscribe({
        next: (res) => {
          this.presentToast("Channel created successfully!");
          this.dismiss({ created: res.channel });
        },
        error: (err) => {
          console.error(err);
          this.presentToast(err?.error?.message || "Failed to create channel");
        }
      });

  } catch (err) {
    console.error(err);
    loader.dismiss();
    this.presentToast("Unexpected error occurred");
  }
}


}
