// import { Injectable } from '@angular/core';

// @Injectable({
//   providedIn: 'root'
// })
// export class ChannelUiState {
  
// }
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChannelUiStateService {

  /** Show spinner only on first load */
  private firstLoadDone = false;

  private loading$ = new BehaviorSubject<boolean>(false);

  /** Observable for UI */
  readonly isLoading$ = this.loading$.asObservable();

  /** Call before cache load */
  startInitialLoad() {
    if (!this.firstLoadDone) {
      this.loading$.next(true);
    }
  }

  /** Call after cache is rendered */
  finishInitialLoad() {
    this.firstLoadDone = true;
    this.loading$.next(false);
  }

  /** For manual refresh (pull to refresh) */
  startRefresh() {
    this.loading$.next(true);
  }

  finishRefresh() {
    this.loading$.next(false);
  }

  /** Useful when leaving page */
  reset() {
    this.loading$.next(false);
  }



hasLoadedOnce(): boolean {
  return this.firstLoadDone;
}



}
