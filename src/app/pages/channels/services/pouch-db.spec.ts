import { TestBed } from '@angular/core/testing';

import { PouchDb } from './pouch-db';

describe('PouchDb', () => {
  let service: PouchDb;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PouchDb);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
