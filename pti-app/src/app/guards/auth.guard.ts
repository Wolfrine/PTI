import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.authService.getUser().pipe(
      map((user) => {
        if (user) {
          return true; // Allow navigation if user is logged in
        } else {
          this.router.navigate(['/'], {
            queryParams: { redirect: state.url },
          }); // Redirect to login if not authenticated
          return false;
        }
      })
    );
  }
}
