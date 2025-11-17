import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddMembersCommunityPage } from './add-members-community.page';

describe('AddMembersCommunityPage', () => {
  let component: AddMembersCommunityPage;
  let fixture: ComponentFixture<AddMembersCommunityPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddMembersCommunityPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
