import { Injectable } from '@angular/core';
import { Auth, signInWithPopup, GoogleAuthProvider, signOut, user } from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  user$: Observable<any>;

  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {
    this.user$ = user(auth); // Now using the already initialized 'auth' instance
  }

  // Google Sign-In
  async signInWithGoogle(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(this.auth, provider);
      const user = credential.user;

      // Store user info in Firestore (if not already exists)
      const userRef = doc(this.firestore, `users/${user.uid}`);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdOn: new Date(),
      }, { merge: true });

      this.router.navigate(['/dashboard']); // Redirect to dashboard
    } catch (error) {
      console.error('Login Error:', error);
    }
  }

  // Logout
  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.router.navigate(['/']);
  }
}
