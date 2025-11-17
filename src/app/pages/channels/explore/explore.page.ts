import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-explore',
  templateUrl: './explore.page.html',
  styleUrls: ['./explore.page.scss'],
    standalone: true,
    imports: [IonicModule, CommonModule,FormsModule,RouterModule],
})
export class ExplorePage implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
