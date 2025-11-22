import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectContactListPage } from './select-contact-list.page';

describe('SelectContactListPage', () => {
  let component: SelectContactListPage;
  let fixture: ComponentFixture<SelectContactListPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SelectContactListPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
