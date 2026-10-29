import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { NewAtlasComponent } from './new-atlas.component';
@Component({selector:'app-atlas-field',standalone:true,imports:[CommonModule],templateUrl:'./atlas-field.component.html',styleUrl:'./atlas-field.component.scss'})
export class AtlasFieldComponent { @Input({required:true}) context!:NewAtlasComponent; }

