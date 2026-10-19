import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { navigateAfterLogin, loginPresentation } from '../../services/login-return';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
    private popupInProgress = false;
    onePiece = false;
    constructor(
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute,
        private title: Title,
        @Inject(PLATFORM_ID) private platformId: object
    ) { }

    ngOnInit() {
        if (isPlatformBrowser(this.platformId)) {
            this.onePiece = loginPresentation(window.location.origin, this.route.snapshot.queryParamMap.get('redirect')).onePiece;
            if (this.onePiece) this.title.setTitle('One Piece · Sign in');
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
        return loginPresentation(isPlatformBrowser(this.platformId) ? window.location.origin : '', redirect).returnPath;
    }
}
