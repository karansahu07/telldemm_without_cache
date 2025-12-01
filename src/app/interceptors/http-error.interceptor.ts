import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpErrorResponse,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastController } from '@ionic/angular';

@Injectable()
export class ServerErrorInterceptor implements HttpInterceptor {

  private isToastVisible = false;

  constructor(private toastCtrl: ToastController) {}

  private async showToast(message: string) {
    if (this.isToastVisible) return;

    this.isToastVisible = true;

    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      color: 'danger',
      position: 'bottom',
    });

    await toast.present();

    toast.onDidDismiss().then(() => {
      this.isToastVisible = false;
    });
  }

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return next.handle(req).pipe(
      catchError((error: HttpErrorResponse) => {

        // 🔴 NO INTERNET
        if (!navigator.onLine) {
          this.showToast('No internet connection. Please check your network.');
          return throwError(() => error);
        }

        // 🔴 SERVER DOWN OR UNREACHABLE
        if (error.status === 0) {
          this.showToast('Server is unreachable. Please try again later.');
          return throwError(() => error);
        }

        return throwError(() => error);
      })
    );
  }
}
