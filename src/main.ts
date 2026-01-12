import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { initializeApp } from 'firebase/app';
// import { environment } from './environments/environment';
import { defineCustomElements } from 'jeep-sqlite/loader';
import { environment } from './environments/environment.prod';

defineCustomElements(window);



// initializeApp(environment.firebaseConfig);

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.error(err));

  if (environment.production) {
  // window.console.log = () => {};
  // window.console.warn = () => {};
  // window.console.info = () => {};
  // window.console.debug = () => {};
}
