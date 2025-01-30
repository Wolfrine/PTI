import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FirestoreService } from './firestore.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'pti-app';
  
    items: any[] = [];
  
    constructor(private firestoreService: FirestoreService) {}
  
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
      });
    }
  
    // Delete document
    deleteUser(userId: string) {
      this.firestoreService.deleteDocument('users', userId);
    }
  }
