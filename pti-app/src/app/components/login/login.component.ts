import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
    constructor(
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit() {
        this.authService.getUser().subscribe((user) => {
            if (user) {
                this.router.navigate([this.redirectRoute]);
            } else {
                this.authService.initGoogleOneTap();
            }
        });
    }

    login() {
        this.authService.signInWithGoogle(this.redirectRoute);
    }

    private get redirectRoute(): string {
        const redirect = this.route.snapshot.queryParamMap.get('redirect');
        return redirect?.startsWith('/') ? redirect : '/dashboard';
    }
}
