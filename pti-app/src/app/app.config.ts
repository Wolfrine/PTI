import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

// Import Firebase services
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async'; // ✅ Import Auth

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs",
  authDomain: "pti-app-2ab59.firebaseapp.com",
  projectId: "pti-app-2ab59",
  storageBucket: "pti-app-2ab59.firebasestorage.app",
  messagingSenderId: "185802494856",
  appId: "1:185802494856:web:5e9777771492528c6e203d",
  measurementId: "G-BY7B708EVV"
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideFirebaseApp(() => initializeApp(firebaseConfig)), // ✅ Initialize Firebase
    provideFirestore(() => getFirestore()), // ✅ Provide Firestore
    provideAuth(() => getAuth()), provideAnimationsAsync() // ✅ Add Firebase Auth (Fixes the "No provider for Auth!" error)
  ]
};
