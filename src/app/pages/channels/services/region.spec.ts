import { TestBed } from '@angular/core/testing';

import { Region } from './region';

describe('Region', () => {
  let service: Region;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Region);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
