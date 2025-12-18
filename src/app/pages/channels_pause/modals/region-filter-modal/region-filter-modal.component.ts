import { Component, Input, OnInit } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import type { Region, Category } from '../../services/channel';

@Component({
  selector: 'app-region-filter-modal',
  templateUrl: './region-filter-modal.component.html',
  styleUrls: ['./region-filter-modal.component.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, RouterModule],
})
export class RegionFilterModalComponent implements OnInit {
  @Input() regions: Region[] = [];
  @Input() categories: Category[] = []; // still accepted but not shown for now

  // keep UI focused on regions only
  tab: 'regions' | 'categories' = 'regions';
  search = '';

  // track selection as objects to easily supply name+id to parent
  selectedRegion?: Region | null = null;
  // selectedCategory?: Category | null = null; // commented out for now

  constructor(private modalCtrl: ModalController) {}

  ngOnInit(): void {
    this.regions = this.regions || [];
    this.categories = this.categories || [];
    // lock to regions tab (we are not using categories now)
    this.tab = 'regions';
  }

  // Cancel without applying
  cancel() {
    this.modalCtrl.dismiss(null);
  }

  // Apply selection and dismiss a single payload (region info)
  apply() {
    const payload: any = {
      selectedRegionId: this.selectedRegion?.region_id ?? null,
      selectedRegionName: this.selectedRegion?.region_name ?? null,
      // selectedCategoryId: this.selectedCategory?.id ?? null,
      // selectedCategoryName: this.selectedCategory?.category_name ?? null
    };
    this.modalCtrl.dismiss(payload);
  }

  selectRegion(region: Region) {
    if (this.selectedRegion && this.selectedRegion.region_id === region.region_id) {
      this.selectedRegion = null;
    } else {
      this.selectedRegion = region;
    }
  }

  clearFilters() {
    this.search = '';
    this.selectedRegion = null;
  }

  get filteredRegions(): Region[] {
    if (!this.search) return this.regions;
    const s = this.search.toLowerCase();
    return this.regions.filter(r => (r.region_name || '').toLowerCase().includes(s));
  }

  // category helpers commented out for now
  /*
  get filteredCategories(): Category[] {
    if (!this.search) return this.categories;
    const s = this.search.toLowerCase();
    return this.categories.filter(c => (c.category_name || '').toLowerCase().includes(s));
  }
  */
}
