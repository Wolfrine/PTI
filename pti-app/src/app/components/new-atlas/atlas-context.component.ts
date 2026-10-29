import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { NewAtlasComponent } from './new-atlas.component';

@Component({selector:'app-atlas-context',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./atlas-context.component.html',styleUrl:'./atlas-context.component.scss'})
export class AtlasContextComponent {
  @Input({required:true}) context!: NewAtlasComponent;
}

