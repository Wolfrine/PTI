import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TargetTaskService } from '../../../services/target-task.service';
import { ActivatedRoute, Router } from '@angular/router';

interface Target {
    id?: string;
    name: string;
    deadline: string;
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
    showTargetInput = false;
    showTaskInput = false;
    showEditTargetInput: string | null = null;
    showEditTaskInput: string | null = null;
    selectedTargetId: string | null = null;

    newTarget: Target = { name: '', deadline: '', progress: 0 };
    editedTarget: Target = { name: '', deadline: '', progress: 0 };

    newTask: Task = { name: '', estimatedTime: 0, completed: false };
    editedTask: Task = { name: '', estimatedTime: 0, completed: false };

    constructor(
        private targetTaskService: TargetTaskService,
        private route: ActivatedRoute,
        public router: Router
    ) { }

    async ngOnInit() {
        this.domainId = this.route.snapshot.paramMap.get('domainId') || '';
        this.domainName = this.route.snapshot.queryParamMap.get('name') || '';

        // ✅ Fetch targets
        (await this.targetTaskService.getTargets(this.domainId)).subscribe((targets: Target[]) => {
            this.targets = targets;

            // ✅ Fetch tasks for each target
            this.targets.forEach(async target => {
                if (target.id) {
                    (await this.targetTaskService.getTasks(this.domainId, target.id)).subscribe((tasks: Task[]) => {
                        target.tasks = tasks;  // ✅ Assign tasks to each target
                    });
                }
            });
        });
    }

    toggleTargetInput() {
        this.showTargetInput = !this.showTargetInput;
    }

    addTarget() {
        if (!this.newTarget.name || !this.newTarget.deadline) return;
        this.targetTaskService.addTarget(this.domainId, this.newTarget).then(() => {
            this.newTarget = { name: '', deadline: '', progress: 0 };
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
        });
    }

    markTaskComplete(targetId: string, task: Task) {
        this.targetTaskService.completeTask(this.domainId, targetId, task.id!, task.estimatedTime);
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
}
