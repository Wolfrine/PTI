import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { navigateAfterLogin, safeLoginReturn, onePieceLoginAlias } from '../../services/login-return';

@Component({
    selector: 'app-login',
    imports: [CommonModule],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
    private popupInProgress = false;
    private destroyRef = inject(DestroyRef);
    get signInState$() { return this.authService.signInState$; }
    constructor(
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit() {
        const onePiece = onePieceLoginAlias(this.route.snapshot.queryParamMap.get('redirect'));
        if (onePiece && typeof window !== 'undefined') {
            window.location.replace(onePiece);
            return;
        }
        this.authService.getUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => {
            if (user && !this.popupInProgress) {
                navigateAfterLogin(this.redirectRoute, this.router);
            } else if (!user) {
                this.authService.initGoogleOneTap();
            }
        });
    }

    login() {
        if (this.popupInProgress) return;
        this.popupInProgress = true;
        this.authService.signInWithGoogle(this.redirectRoute).finally(() => { this.popupInProgress = false; });
    }

    private get redirectRoute(): string {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        return safeLoginReturn(redirect).path;
    }
}
