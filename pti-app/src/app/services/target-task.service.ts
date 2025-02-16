import { Injectable } from '@angular/core';
import { Firestore, collection, doc, addDoc, updateDoc, collectionData, deleteDoc, getDocs } from '@angular/fire/firestore';
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
        await updateDoc(taskRef, {
            completed: true,
            completedTime: completedTime,
            completionDate: new Date(), // ✅ Store Completion Date
        });
    }

    // ✅ Update Target Name and Deadline
    async updateTarget(domainId: string, targetId: string, updatedData: any): Promise<void> {
        const userId = await this.getUserId();
        const targetRef = doc(this.firestore, `users/${userId}/domains/${domainId}/targets/${targetId}`);
        await updateDoc(targetRef, updatedData);
    }

    // ✅ Update Task Name and Estimated Time
    async updateTask(domainId: string, targetId: string, taskId: string, updatedData: any): Promise<void> {
        const userId = await this.getUserId();
        const taskRef = doc(this.firestore, `users/${userId}/domains/${domainId}/targets/${targetId}/tasks/${taskId}`);
        await updateDoc(taskRef, updatedData);
    }

    async deleteTask(domainId: string, targetId: string, taskId: string,): Promise<void> {
        const userId = await this.getUserId();

        const taskRef = doc(this.firestore, `users/${userId}/domains/${domainId}/targets/${targetId}/tasks/${taskId}`);
        await deleteDoc(taskRef);
    }

    async getCompletedTasksSince(daysAgo: number): Promise<any[]> {
        const userId = await this.getUserId();
        if (!userId) {
            console.error('❌ ERROR: User not authenticated');
            throw new Error('User not authenticated');
        }
        console.log(`✅ User ID: ${userId}`);

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        console.log(`🔍 Fetching tasks completed since: ${cutoffDate.toISOString()}`);

        const completedTasks: any[] = [];

        // ✅ Fetch all user domains
        const domainsQuery = collection(this.firestore, `users/${userId}/domains`);
        const domainsSnapshot = await getDocs(domainsQuery);
        console.log(`📂 Found ${domainsSnapshot.docs.length} domains.`);

        for (const domainDoc of domainsSnapshot.docs) {
            const domainId = domainDoc.id;
            console.log(`🔹 Checking domain: ${domainId}`);

            // ✅ Fetch all targets inside this domain
            const targetsQuery = collection(this.firestore, `users/${userId}/domains/${domainId}/targets`);
            const targetsSnapshot = await getDocs(targetsQuery);
            console.log(`📌 Found ${targetsSnapshot.docs.length} targets in domain ${domainId}`);

            for (const targetDoc of targetsSnapshot.docs) {
                const targetId = targetDoc.id;
                console.log(`  🔹 Checking target: ${targetId}`);

                // ✅ Fetch all tasks inside this target
                const tasksQuery = collection(this.firestore, `users/${userId}/domains/${domainId}/targets/${targetId}/tasks`);
                const tasksSnapshot = await getDocs(tasksQuery);
                console.log(`  📌 Found ${tasksSnapshot.docs.length} tasks in target ${targetId}`);

                tasksSnapshot.forEach(taskDoc => {
                    const task = taskDoc.data();
                    console.log(`    🔎 Task: ${taskDoc.id}, Completed: ${task['completed']}, Completion Date: ${task['completionDate']?.toDate()}`);

                    if (task['completed'] && task['completionDate'] && task['completionDate'].toDate() >= cutoffDate) {
                        console.log(`    ✅ Task ${taskDoc.id} added to completed list`);
                        completedTasks.push(task);
                    }
                });
            }
        }

        console.log(`✅ Total completed tasks in the last ${daysAgo} days: ${completedTasks.length}`);
        return completedTasks;
    }

    async updateDomainStats(domainId: string, progress: number, totalEstimated: number, totalCompleted: number, totalPending: number): Promise<void> {
        const userId = await this.getUserId();
        if (!userId) return;

        const domainRef = doc(this.firestore, `users/${userId}/domains/${domainId}`);

        try {
            await updateDoc(domainRef, {
                progress,
                totalEstimated,
                totalCompleted,
                totalPending
            });
            console.log(`✅ Firestore Updated: Domain ${domainId} - Progress: ${progress}%, Estimated: ${totalEstimated}h, Completed: ${totalCompleted}h, Pending: ${totalPending}h`);
        } catch (error) {
            console.error(`❌ Error updating domain stats:`, error);
        }
    }


}
