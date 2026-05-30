import { Injectable } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import {
  Firestore,
  addDoc,
  collection,
  collectionData,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';

export type CodexActionKind = 'action' | 'feedback' | 'next_plan' | 'activity';
export type CodexActionStatus = 'open' | 'discussing' | 'ready_for_codex' | 'in_progress' | 'blocked' | 'completed';

export interface CodexProjectActionItem {
  id?: string;
  kind: CodexActionKind;
  text: string;
  status: CodexActionStatus;
  source: 'pti-dashboard' | 'codex-mcp' | 'codex-chat';
  projectId: string;
  projectName?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
}

export interface CodexProjectSnapshot {
  id: string;
  name: string;
  group: string;
  status: string;
  branch: string;
  workingTree: string;
  localPath: string;
  repo: string;
  deployment: string;
  standing: string;
  nextAction: string;
}

@Injectable({
  providedIn: 'root',
})
export class CodexCommandNotesService {
  constructor(
    private readonly firestore: Firestore,
    private readonly auth: Auth,
  ) {}

  watchActionItems(projectId: string, itemLimit = 5): Observable<CodexProjectActionItem[]> {
    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      return of([]);
    }

    const actionCollection = collection(this.firestore, this.actionItemsPath(uid, projectId));
    const actionQuery = query(actionCollection, orderBy('createdAt', 'desc'), limit(itemLimit));
    return collectionData(actionQuery, { idField: 'id' }) as Observable<CodexProjectActionItem[]>;
  }

  async saveProjectSnapshot(project: CodexProjectSnapshot): Promise<void> {
    const uid = this.requireUid();
    await setDoc(doc(this.firestore, this.projectPath(uid, project.id)), {
      ...project,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  async addActionItem(project: CodexProjectSnapshot, kind: CodexActionKind, text: string): Promise<void> {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    const uid = this.requireUid();
    await this.saveProjectSnapshot(project);
    await addDoc(collection(this.firestore, this.actionItemsPath(uid, project.id)), {
      kind,
      text: normalized,
      status: 'open',
      source: 'pti-dashboard',
      projectId: project.id,
      projectName: project.name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<CodexProjectActionItem, 'id'>);
  }

  async markCompleted(projectId: string, itemId: string): Promise<void> {
    const uid = this.requireUid();
    await updateDoc(doc(this.firestore, `${this.actionItemsPath(uid, projectId)}/${itemId}`), {
      status: 'completed',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  private requireUid(): string {
    const uid = this.auth.currentUser?.uid;
    if (!uid) {
      throw new Error('A signed-in user is required to write Codex command action items.');
    }
    return uid;
  }

  private projectPath(uid: string, projectId: string): string {
    return `users/${uid}/codexProjects/${projectId}`;
  }

  private actionItemsPath(uid: string, projectId: string): string {
    return `${this.projectPath(uid, projectId)}/actionItems`;
  }
}
