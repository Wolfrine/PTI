import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { navigateAfterLogin, safeLoginReturn, onePieceLoginAlias } from '../../services/login-return';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
    private popupInProgress = false;
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
        this.authService.getUser().subscribe((user) => {
            if (user && !this.popupInProgress) {
                navigateAfterLogin(this.redirectRoute, this.router);
            } else if (!user) {
                this.authService.initGoogleOneTap();
            }
        });
    }

    login() {
        this.popupInProgress = true;
        this.authService.signInWithGoogle(this.redirectRoute).finally(() => { this.popupInProgress = false; });
    }

    private get redirectRoute(): string {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        return safeLoginReturn(redirect).path;
    }
}
