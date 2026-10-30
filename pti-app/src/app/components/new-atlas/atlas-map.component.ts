import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { NewAtlasComponent } from './new-atlas.component';
import { AtlasFieldComponent } from './atlas-field.component';

@Component({selector:'app-atlas-map',standalone:true,imports:[CommonModule,FormsModule,AtlasFieldComponent],templateUrl:'./atlas-map.component.html',styleUrls:['./atlas-map.component.scss','./atlas-radial-map.scss']})
export class AtlasMapComponent {
  @Input({required:true}) context!: NewAtlasComponent;
}

