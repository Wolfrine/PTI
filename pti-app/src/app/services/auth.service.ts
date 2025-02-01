import { Injectable } from '@angular/core';
import { Auth, signInWithPopup, GoogleAuthProvider, signOut, user, onAuthStateChanged } from '@angular/fire/auth';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<any>(null); // Store user state
  user$ = this.userSubject.asObservable(); // Observable for other components

  constructor(private auth: Auth, private firestore: Firestore, private router: Router) {
    // Auto-detect auth state changes and update globally
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this.userSubject.next(user);
      } else {
        this.userSubject.next(null);
      }
    });
  }

  // Sign in with Google
  async signInWithGoogle(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(this.auth, provider);
      const user = credential.user;

      // Store user in Firestore
      const userRef = doc(this.firestore, `users/${user.uid}`);
      await setDoc(userRef, {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        createdOn: new Date(),
      }, { merge: true });

      this.userSubject.next(user);
      this.router.navigate(['/dashboard']); // Redirect to dashboard
    } catch (error) {
      console.error('Login Error:', error);
    }
  }

  // Sign out
  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.userSubject.next(null);
    this.router.navigate(['/']);
  }

  // Get user as observable
  getUser(): Observable<any> {
    return this.user$;
  }
}
