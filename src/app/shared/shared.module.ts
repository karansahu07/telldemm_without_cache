import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { ReactionButtonComponent } from '../pages/channels/components/reaction-button/reaction-button.component';

// Standalone components must be imported, not declared
// import { ReactionButtonComponent } from './components/reaction-button/reaction-button.component';

@NgModule({
  declarations: [
    // only non-standalone components/pipes/directives go here
    // e.g. SharedNonStandaloneComponent
  ],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    ReactionButtonComponent // <- import the standalone component here
  ],
  exports: [
    // export what feature modules should see
    CommonModule,
    IonicModule,
    FormsModule,
    ReactionButtonComponent // <- exporting works because it's imported
  ]
})
export class SharedModule {}
