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
  googleClientId = 'YOUR_GOOGLE_CLIENT_ID'; // Replace with Firebase OAuth Client ID

  constructor(
    private auth: Auth,
    private firestore: Firestore,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.checkUserSession();
  }

  private oneTapInitialized = false; // ✅ Prevent duplicate One Tap calls

  initGoogleOneTap() {
    if (this.oneTapInitialized) return; // ✅ Skip if already initialized
    this.oneTapInitialized = true; // ✅ Set flag to prevent multiple requests

    if (typeof window !== 'undefined' && window.google?.accounts) {
      window.google.accounts.id.initialize({
        client_id: this.googleClientId,
        callback: (response: { credential: string }) =>
          this.handleCredentialResponse(response),
        auto_select: true,
        cancel_on_tap_outside: false,
      });
      window.google.accounts.id.prompt();
    } else {
      console.warn('Google One Tap script not loaded yet.');
    }
  }

  // ✅ Handle One Tap Credential Response
  async handleCredentialResponse(response: { credential: string }) {
    try {
      const credential = GoogleAuthProvider.credential(response.credential);
      const result = await signInWithCredential(this.auth, credential);
      const user = result.user;

      await this.storeUserInFirestore(user);
      this.userSubject.next(user);
    } catch (error) {
      console.error('Google One Tap Sign-In Error:', error);
    }
  }

  // ✅ Sign in with Google Popup
  async signInWithGoogle(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(this.auth, provider);
      const user = credential.user;

      await this.storeUserInFirestore(user);
      this.userSubject.next(user);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Login Error:', error);
    }
  }

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
      this.ngZone.run(() => {
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
