import { Component, OnInit } from '@angular/core';
import { FirestoreService } from '../../services/firestore.service';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports : [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  title = 'pti-app';
  items: any[] = [];

  constructor(private firestoreService: FirestoreService, private authService: AuthService) {}

  ngOnInit() {
    // Fetch all documents from 'users' collection
    this.firestoreService.getDocuments('users').subscribe((data) => {
      this.items = data;
    });
  }

  // Add new document
  addUser() {
    const userId = 'user-' + Math.random().toString(36).substr(2, 5);
    this.firestoreService.addDocument('users', userId, {
      name: 'John Doe',
      age: 30,
      id: userId
    });
  }

  // Delete document
  deleteUser(userId: string) {
    this.firestoreService.deleteDocument('users', userId);
  }

  // Sign out
  logout() {
    this.authService.signOut();
  }
}
