import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Router, NavigationEnd } from '@angular/router';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})

export class AppComponent implements OnInit {
    title = "PTI App";
    constructor(public authService: AuthService, private router: Router) { }

    ngOnInit() {
        setTimeout(() => {
            this.authService.initGoogleOneTap(); // ✅ Delayed execution to avoid conflicts
            this.authService.checkUserSession();
        }, 1000); // ✅ Small delay to allow page initialization

        this.router.events.subscribe(event => {
            if (event instanceof NavigationEnd) {
                window.scrollTo(0, 0); // ✅ Scrolls to top on every route change
            }
        });
    }
}