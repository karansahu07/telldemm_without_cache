// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class Region {
  
// }
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RegionService {
  getAllRegions(): string[] {
    return [
      'India', 'Afghanistan', 'Åland Islands', 'Albania', 'Algeria', 'American Samoa'
      // ... add full list or load from JSON
    ];
  }
}
