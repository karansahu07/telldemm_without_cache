import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SelectAddAndCreateGroupPage } from './select-add-and-create-group.page';

describe('SelectAddAndCreateGroupPage', () => {
  let component: SelectAddAndCreateGroupPage;
  let fixture: ComponentFixture<SelectAddAndCreateGroupPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SelectAddAndCreateGroupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
