import { Injectable } from '@angular/core';
import {
    Auth,
    GoogleAuthProvider,
    authState,
    signInWithCredential,
    signInWithPopup,
    signOut,
} from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

declare global {
    interface Window {
        google: any;
    }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly userSubject = new BehaviorSubject<any>(null);
    readonly user$ = this.userSubject.asObservable();
    readonly googleClientId = '185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com';
    private oneTapInitialized = false;
    private sessionInitialized = false;

    constructor(
        private readonly auth: Auth,
        private readonly firestore: Firestore,
        private readonly router: Router,
    ) {
        this.checkUserSession();
    }

    initGoogleOneTap(): void {
        if (this.oneTapInitialized || this.userSubject.value) {
            return;
        }
        this.oneTapInitialized = true;

        this.loadGoogleScript()
            .then(() => {
                if (!window.google?.accounts) {
                    return;
                }
                window.google.accounts.id.initialize({
                    client_id: this.googleClientId,
                    callback: (response: { credential: string }) => this.handleCredentialResponse(response),
                    auto_select: true,
                    cancel_on_tap_outside: false,
                });
                window.google.accounts.id.prompt();
            })
            .catch((error) => console.error('Google One Tap failed to initialize:', error));
    }

    async handleCredentialResponse(response: { credential: string }): Promise<void> {
        try {
            const result = await signInWithCredential(
                this.auth,
                GoogleAuthProvider.credential(response.credential),
            );
            await this.storeUserInFirestore(result.user);
            this.userSubject.next(result.user);
        } catch (error) {
            console.error('Google One Tap sign-in failed:', error);
        }
    }

    async signInWithGoogle(redirectRoute = '/home'): Promise<void> {
        try {
            const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
            await this.storeUserInFirestore(result.user);
            this.userSubject.next(result.user);
            await this.router.navigate([redirectRoute]);
        } catch (error) {
            console.error('Google sign-in failed:', error);
        }
    }

    checkUserSession(): void {
        if (this.sessionInitialized) {
            return;
        }
        this.sessionInitialized = true;
        authState(this.auth).subscribe((user) => this.userSubject.next(user ?? null));
    }

    async signOut(): Promise<void> {
        await signOut(this.auth);
        this.userSubject.next(null);
        await this.router.navigate(['/']);
    }

    getUser(): Observable<any> {
        return this.user$;
    }

    private loadGoogleScript(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (document.getElementById('google-one-tap-script')) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.id = 'google-one-tap-script';
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Google One Tap script'));
            document.head.appendChild(script);
        });
    }

    private async storeUserInFirestore(user: any): Promise<void> {
        const userReference = doc(this.firestore, `users/${user.uid}`);
        const userSnapshot = await getDoc(userReference);
        await setDoc(userReference, {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            createdOn: userSnapshot.exists()
                ? userSnapshot.data()?.['createdOn']
                : new Date(),
        }, { merge: true });
    }
}
