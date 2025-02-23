import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TargetTaskService } from '../../../services/target-task.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ActivityService } from '../../../services/activity.service';

interface Target {
    id?: string;
    name: string;
    deadline: string;
    totalEstimated: number;
    totalCompleted: number;
    progress: number;
    tasks?: Task[];
}

interface Task {
    id?: string;
    name: string;
    estimatedTime: number;
    completedTime?: number;
    completed: boolean;
}

@Component({
    selector: 'app-manage-targets-tasks',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './manage-targets-tasks.component.html',
    styleUrls: ['./manage-targets-tasks.component.scss'],
})
export class ManageTargetsTasksComponent implements OnInit {
    domainId: string = '';
    domainName: string = '';
    targets: Target[] = [];
    domainProgress: number = 0;
    showTargetInput = false;
    showTaskInput = false;
    showEditTargetInput: string | null = null;
    showEditTaskInput: string | null = null;
    selectedTargetId: string | null = null;
    totalEstimated = 0;
    totalCompleted = 0;
    totalPending = this.totalEstimated - this.totalCompleted;

    newTarget: Target = { name: '', deadline: '', progress: 0, totalEstimated: 0, totalCompleted: 0 };
    editedTarget: Target = { name: '', deadline: '', progress: 0, totalEstimated: 0, totalCompleted: 0 };

    newTask: Task = { name: '', estimatedTime: 0, completed: false };
    editedTask: Task = { name: '', estimatedTime: 0, completed: false };

    constructor(
        private targetTaskService: TargetTaskService,
        private activityService: ActivityService,
        private route: ActivatedRoute,
        public router: Router
    ) { }

    async ngOnInit() {
        this.domainId = this.route.snapshot.paramMap.get('domainId') || '';
        this.domainName = this.route.snapshot.queryParamMap.get('name') || '';

        (await this.targetTaskService.getTargets(this.domainId)).subscribe((targets: Target[]) => {
            this.targets = targets;

            this.targets.forEach(async target => {
                if (target.id) {
                    (await this.targetTaskService.getTasks(this.domainId, target.id)).subscribe((tasks: Task[]) => {
                        target.tasks = tasks;
                        this.calculateDomainProgress(); // ✅ Recalculate Progress after tasks are loaded
                    });
                }
            });
        });
    }

    async calculateDomainProgress() {
        this.totalEstimated = 0;
        this.totalCompleted = 0;

        for (const target of this.targets) {
            if (!target.tasks) continue;

            // ✅ Calculate Target-Level Progress
            target.totalEstimated = target.tasks.reduce((sum, task) => sum + (task.estimatedTime || 0), 0);
            target.totalCompleted = target.tasks.reduce((sum, task) => sum + (task.completedTime || 0), 0);
            target.progress = target.totalEstimated > 0 ? Math.round((target.totalCompleted / target.totalEstimated) * 100) : 0;

            // ✅ Aggregate into Domain-Level
            this.totalEstimated += target.totalEstimated;
            this.totalCompleted += target.totalCompleted;
        }

        // ✅ Calculate Domain Progress and Pending Time
        this.domainProgress = this.totalEstimated > 0 ? Math.round((this.totalCompleted / this.totalEstimated) * 100) : 0;
        this.totalPending = this.totalEstimated - this.totalCompleted;

        console.log(`📌 Updated Domain Stats: Progress: ${this.domainProgress}%, Estimated: ${this.totalEstimated}h, Completed: ${this.totalCompleted}h, Pending: ${this.totalPending}h`);

        // ✅ Update Firestore with all values
        await this.targetTaskService.updateDomainStats(this.domainId, this.domainProgress, this.totalEstimated, this.totalCompleted, this.totalPending);
    }

    toggleTargetInput() {
        this.showTargetInput = !this.showTargetInput;
    }

    addTarget() {
        if (!this.newTarget.name || !this.newTarget.deadline) return;
        this.targetTaskService.addTarget(this.domainId, this.newTarget).then(() => {
            this.newTarget = { name: '', deadline: '', progress: 0, totalEstimated: 0, totalCompleted: 0 };
            this.showTargetInput = false;
        });
    }

    toggleTaskInput(targetId: string) {
        this.selectedTargetId = targetId;
        this.showTaskInput = !this.showTaskInput;
    }

    addTask(targetId: string) {
        if (!this.newTask.name || !this.newTask.estimatedTime) return;
        this.targetTaskService.addTask(this.domainId, targetId, this.newTask).then(() => {
            this.newTask = { name: '', estimatedTime: 0, completed: false };
            this.showTaskInput = false;
            this.calculateDomainProgress(); // ✅ Recalculate after adding a task
        });
    }

    markTaskComplete(targetId: string, task: Task) {
        this.targetTaskService.completeTask(this.domainId, targetId, task.id!, task.estimatedTime).then(() => {
            this.logCompletedTaskAsActivity(task);
            this.calculateDomainProgress(); // ✅ Recalculate after marking a task complete
        });
    }

    private async logCompletedTaskAsActivity(task: Task): Promise<void> {
        try {
            await this.activityService.logTaskAsActivity(task, this.domainName);
        } catch (error) {
            console.error('Error logging completed task as activity:', error);
        }
    }

    // ✅ Edit Target
    editTarget(targetId: string | undefined) {
        if (!targetId) return; // ✅ Prevent undefined errors
        this.showEditTargetInput = targetId;
        const target = this.targets.find(t => t.id === targetId);
        if (target) {
            this.editedTarget = { ...target };
        }
    }

    saveEditedTarget(targetId: string | undefined) {
        if (!targetId) return; // ✅ Prevent undefined errors
        this.targetTaskService.updateTarget(this.domainId, targetId, this.editedTarget).then(() => {
            this.showEditTargetInput = null;
        });
    }

    // ✅ Edit Task
    editTask(targetId: string | undefined, taskId: string | undefined) {
        if (!targetId || !taskId) return; // ✅ Prevent undefined errors
        this.showEditTaskInput = taskId;
        const target = this.targets.find(t => t.id === targetId);
        const task = target?.tasks?.find(t => t.id === taskId);
        if (task) {
            this.editedTask = { ...task };
        }
    }

    saveEditedTask(targetId: string | undefined, taskId: string | undefined) {
        if (!targetId || !taskId) return; // ✅ Prevent undefined errors
        this.targetTaskService.updateTask(this.domainId, targetId, taskId, this.editedTask).then(() => {
            this.showEditTaskInput = null;
        });
    }

    deleteTask(targetId: string | undefined, taskId: string | undefined) {
        if (!targetId || !taskId) return;
        this.targetTaskService.deleteTask(this.domainId, targetId, taskId).then(() => {
            console.log("✅ Task deleted");
            this.calculateDomainProgress(); // ✅ Recalculate after deleting a task
        });
    }
}
