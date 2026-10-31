import { Injectable, NgZone } from '@angular/core';
import {
    Auth,
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    onAuthStateChanged,
    signInWithCredential,
} from '@angular/fire/auth';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { navigateAfterLogin } from './login-return';
import { SignInState, signInErrorMessage } from './sign-in-feedback';

declare global {
    interface Window {
        google: any;
    }
}

@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private userSubject = new BehaviorSubject<any>(null);
    user$ = this.userSubject.asObservable();
    private signInStateSubject = new BehaviorSubject<SignInState>({ busy: false, error: null });
    signInState$ = this.signInStateSubject.asObservable();
    googleClientId = '185802494856-rn0q6qi5goj0mifha0bkah55slu3kvju.apps.googleusercontent.com'; // Replace with Firebase OAuth Client ID

    constructor(
        private auth: Auth,
        private firestore: Firestore,
        private router: Router,
        private ngZone: NgZone
    ) {
        this.checkUserSession();
    }

    private oneTapInitialized = false; // ✅ Prevent duplicate One Tap calls

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

    async initGoogleOneTap(): Promise<void> {
        if (this.oneTapInitialized || this.userSubject.value) {
            console.log('Skipping One Tap: Already initialized or user logged in.');
            return;
        }

        this.oneTapInitialized = true;

        await this.loadGoogleScript().then(() => {
            if (window.google?.accounts) {
                window.google.accounts.id.initialize({
                    client_id: this.googleClientId,
                    callback: (response: { credential: string }) => this.handleCredentialResponse(response),
                    auto_select: true,
                    cancel_on_tap_outside: false,
                });

                window.google.accounts.id.prompt();
            } else { throw new Error('Google sign-in script unavailable'); }
        }).catch((error) => {
            this.oneTapInitialized = false;
            if (!this.signInStateSubject.value.busy) this.setSignInState({ busy: false, error: 'Google sign-in could not load. Tap Continue with Google to try again.' });
        });
    }




    // ✅ Handle One Tap Credential Response
    async handleCredentialResponse(response: { credential: string }) {
        if (this.signInStateSubject.value.busy) return;
        this.setSignInState({ busy: true, error: null });
        try {
            const result = await this.oneTapCredential(response.credential);
            const user = result.user;

            await this.storeUserInFirestore(user);
            this.userSubject.next(user);
        } catch (error) {
            this.setSignInState({ busy: false, error: signInErrorMessage(error) });
        } finally { this.setSignInState({ ...this.signInStateSubject.value, busy: false }); }
    }

    // ✅ Sign in with Google Popup
    async signInWithGoogle(redirectRoute: string = '/home'): Promise<void> {
        if (this.signInStateSubject.value.busy) return;
        this.setSignInState({ busy: true, error: null });
        try {
            const credential = await this.popupCredential();
            const user = credential.user;

            await this.storeUserInFirestore(user);
            this.userSubject.next(user);
            navigateAfterLogin(redirectRoute, this.router);
        } catch (error) {
            this.setSignInState({ busy: false, error: signInErrorMessage(error) });
        } finally { this.setSignInState({ ...this.signInStateSubject.value, busy: false }); }
    }

    private setSignInState(state: SignInState) { this.ngZone.run(() => this.signInStateSubject.next(state)); }
    private popupCredential() { return signInWithPopup(this.auth, new GoogleAuthProvider()); }
    private oneTapCredential(token: string) { return signInWithCredential(this.auth, GoogleAuthProvider.credential(token)); }

    // ✅ Store User in Firestore (Fix: Preserve `createdOn` date)
    private async storeUserInFirestore(user: any): Promise<void> {
        const userRef = doc(this.firestore, `users/${user.uid}`);
        const userSnapshot = await getDoc(userRef);

        const userData = {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            createdOn: userSnapshot.exists()
                ? userSnapshot.data()?.['createdOn']
                : new Date(), // ✅ Preserve createdOn if exists
        };

        await setDoc(userRef, userData, { merge: true });
    }

    // ✅ Auto Login Check
    checkUserSession() {
        onAuthStateChanged(this.auth, (user) => {
            this.ngZone.run(() => { // ✅ Ensures Firebase updates inside Angular zone
                if (user) {
                    this.userSubject.next(user);
                } else {
                    this.userSubject.next(null);
                }
            });
        });
    }

    // ✅ Sign out
    async signOut(): Promise<void> {
        await signOut(this.auth);
        this.userSubject.next(null);
        this.router.navigate(['/']);
    }

    // ✅ Get User as Observable
    getUser(): Observable<any> {
        return this.user$;
    }
}
