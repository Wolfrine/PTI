import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, docData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class FirestoreService {
  constructor(private firestore: Firestore) {}

  // Add a document to Firestore
  addDocument(collectionName: string, id: string, data: any): Promise<void> {
    const docRef = doc(this.firestore, `${collectionName}/${id}`);
    return setDoc(docRef, data);
  }

  // Get all documents from a collection
  getDocuments(collectionName: string): Observable<any[]> {
    const collectionRef = collection(this.firestore, collectionName);
    return collectionData(collectionRef);
  }

  // Get a single document by ID
  getDocument(collectionName: string, id: string): Observable<any> {
    const docRef = doc(this.firestore, `${collectionName}/${id}`);
    return docData(docRef);
  }

  // Delete a document
  deleteDocument(collectionName: string, id: string): Promise<void> {
    const docRef = doc(this.firestore, `${collectionName}/${id}`);
    return deleteDoc(docRef);
  }
}
