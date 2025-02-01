import { Injectable } from '@angular/core';
import { Firestore, collection, collectionData, doc, setDoc, deleteDoc, updateDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class DomainService {
  constructor(private firestore: Firestore, private auth: Auth) {}

  private getUserDomainsCollection() {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');
    return collection(this.firestore, `users/${user.uid}/domains`);
  }

  // Get all domains for the logged-in user
  getDomains(): Observable<any[]> {
    return collectionData(this.getUserDomainsCollection(), { idField: 'id' });
  }

  // Add a new domain
  async addDomain(domain: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    const domainRef = doc(this.firestore, `users/${user.uid}/domains/${domain.id}`);
    await setDoc(domainRef, { ...domain, createdAt: new Date() });
  }

  // Edit an existing domain
  async updateDomain(domainId: string, updatedData: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    const domainRef = doc(this.firestore, `users/${user.uid}/domains/${domainId}`);
    await updateDoc(domainRef, updatedData);
  }

  // Delete a domain
  async deleteDomain(domainId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    const domainRef = doc(this.firestore, `users/${user.uid}/domains/${domainId}`);
    await deleteDoc(domainRef);
  }
}
