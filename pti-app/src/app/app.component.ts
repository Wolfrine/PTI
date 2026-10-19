import { Component, OnInit } from '@angular/core';
import { NgIf } from '@angular/common';
import { SwUpdate } from '@angular/service-worker';
import { loginPresentation } from './services/login-return';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Router, NavigationEnd } from '@angular/router';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [RouterOutlet, NgIf],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})

export class AppComponent implements OnInit {
    title = "PTI App";
    updateAvailable = false;
    updating = false;
    updateFailed = false;
    get appName(): string {
        return typeof window !== 'undefined' && loginPresentation(window.location.origin, new URLSearchParams(window.location.search).get('redirect')).onePiece ? 'One Piece' : 'PTI';
    }
    constructor(public authService: AuthService, private router: Router, private updates: SwUpdate) { }

    ngOnInit() {
        if (this.updates.isEnabled) {
            this.updates.versionUpdates.subscribe(event => {
                if (event.type === 'VERSION_READY') this.updateAvailable = true;
            });
            void this.updates.checkForUpdate().catch(() => undefined);
        }
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

    async updateApp(): Promise<void> {
        this.updating = true;
        this.updateFailed = false;
        try {
            await this.updates.activateUpdate();
            window.location.reload();
        } catch {
            this.updating = false;
            this.updateFailed = true;
        }
    }
}
