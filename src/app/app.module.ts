import { APP_INITIALIZER, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import {
  HTTP_INTERCEPTORS,
  HttpClient,
  HttpClientModule,
} from '@angular/common/http';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

// import { environment } from '../environments/environment';

// ✅ Modular Firebase imports
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getDatabase, provideDatabase } from '@angular/fire/database';
import { IonicStorageModule } from '@ionic/storage-angular';

// ✅ Custom imports
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { environment } from 'src/environments/environment.prod';
import { AuthService } from './auth/auth.service';
import { ServerErrorInterceptor } from './interceptors/http-error.interceptor';
import { HttpLoaderFactory } from './translate-loader';

// ✅ APP_INITIALIZER to hydrate auth state before app starts
export function initAuth(authService: AuthService) {
  return () => authService.hydrateAuth();
}

@NgModule({
  declarations: [AppComponent],

  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    HttpClientModule,
    TranslateModule.forRoot({
      defaultLanguage: 'en-US',
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
    // IonicStorageModule.forRoot(),
    IonicStorageModule.forRoot({
      name: '_telldemm_firedb',
      driverOrder: ['indexeddb', 'sqlite', 'localstorage']
    }),

    // ✅ Modular Firebase setup
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideDatabase(() => getDatabase()),
  ],

  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ServerErrorInterceptor,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initAuth,
      deps: [AuthService],
      multi: true,
    },
  ],

  bootstrap: [AppComponent],
})
export class AppModule {}
