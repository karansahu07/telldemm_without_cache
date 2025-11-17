import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditCommunityInfoPage } from './edit-community-info.page';

describe('EditCommunityInfoPage', () => {
  let component: EditCommunityInfoPage;
  let fixture: ComponentFixture<EditCommunityInfoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EditCommunityInfoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
