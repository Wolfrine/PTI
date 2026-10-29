import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { NewAtlasComponent } from './new-atlas.component';
import { AtlasSourceApprovalComponent } from './atlas-source-approval.component';
import { AtlasCaptureReceiptsComponent } from './atlas-capture-receipts.component';

@Component({selector:'app-atlas-workspace',standalone:true,imports:[CommonModule,FormsModule,AtlasSourceApprovalComponent,AtlasCaptureReceiptsComponent],templateUrl:'./atlas-workspace.component.html',styleUrl:'./atlas-workspace.component.scss'})
export class AtlasWorkspaceComponent {
  @Input({required:true}) context!: NewAtlasComponent;
}

