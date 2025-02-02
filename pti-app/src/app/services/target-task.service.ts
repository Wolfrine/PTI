import { Injectable } from '@angular/core';
import { Firestore, collection, doc, addDoc, updateDoc, collectionData } from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { firstValueFrom, Observable } from 'rxjs';

@Injectable({
    providedIn: 'root',
})
export class TargetTaskService {
    constructor(private firestore: Firestore, private authService: AuthService) { }

    private async getUserId(): Promise<string> {
        const user = await firstValueFrom(this.authService.user$);
        if (!user) throw new Error('User not authenticated');
        return user.uid;
    }

    // ✅ Get all targets under a domain (Correct domain reference)
    async getTargets(domainId: string): Promise<Observable<any[]>> {
        const userId = await this.getUserId();
        if (!domainId) throw new Error('Domain ID is required');

        const targetRef = collection(this.firestore, `users/${userId}/domains/${domainId}/targets`);
        return collectionData(targetRef, { idField: 'id' });
    }

    // ✅ Add a new target under a domain
    async addTarget(domainId: string, target: any): Promise<void> {
        const userId = await this.getUserId();
        if (!domainId) throw new Error('Domain ID is required');

        const targetRef = collection(this.firestore, `users/${userId}/domains/${domainId}/targets`);

        const docRef = await addDoc(targetRef, {
            ...target,
            createdAt: new Date(),
        });

        // ✅ Firestore-generated ID assigned to target
        await updateDoc(docRef, { id: docRef.id });
    }

    // ✅ Get all tasks under a target
    async getTasks(domainId: string, targetId: string): Promise<Observable<any[]>> {
        const userId = await this.getUserId();
        if (!domainId || !targetId) throw new Error('Domain ID and Target ID are required');

        const taskRef = collection(this.firestore, `users/${userId}/domains/${domainId}/targets/${targetId}/tasks`);
        return collectionData(taskRef, { idField: 'id' });
    }

    // ✅ Add a task under a specific target
    async addTask(domainId: string, targetId: string, task: any): Promise<void> {
        const userId = await this.getUserId();
        if (!domainId || !targetId) throw new Error('Domain ID and Target ID are required');

        const taskRef = collection(this.firestore, `users/${userId}/domains/${domainId}/targets/${targetId}/tasks`);

        const docRef = await addDoc(taskRef, {
            ...task,
            createdAt: new Date(),
        });

        // ✅ Firestore-generated ID assigned to task
        await updateDoc(docRef, { id: docRef.id });
    }

    // ✅ Mark a task as complete
    async completeTask(domainId: string, targetId: string, taskId: string, completedTime: number): Promise<void> {
        const userId = await this.getUserId();
        if (!domainId || !targetId || !taskId) throw new Error('Domain ID, Target ID, and Task ID are required');

        const taskRef = doc(this.firestore, `users/${userId}/domains/${domainId}/targets/${targetId}/tasks/${taskId}`);
        await updateDoc(taskRef, { completed: true, completedTime: completedTime });
    }
}
