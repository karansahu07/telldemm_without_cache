import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddSelectMembersPage } from './add-select-members.page';

describe('AddSelectMembersPage', () => {
  let component: AddSelectMembersPage;
  let fixture: ComponentFixture<AddSelectMembersPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddSelectMembersPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
