import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AddChannelModalComponent } from './add-channel-modal.component';

describe('AddChannelModalComponent', () => {
  let component: AddChannelModalComponent;
  let fixture: ComponentFixture<AddChannelModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [AddChannelModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AddChannelModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
