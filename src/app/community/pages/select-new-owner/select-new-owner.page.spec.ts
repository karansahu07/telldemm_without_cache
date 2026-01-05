import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectNewOwnerPage } from './select-new-owner.page';

describe('SelectNewOwnerPage', () => {
  let component: SelectNewOwnerPage;
  let fixture: ComponentFixture<SelectNewOwnerPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SelectNewOwnerPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
