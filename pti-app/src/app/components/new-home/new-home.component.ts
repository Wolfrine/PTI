import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface LandingOption {
  id: string;
  label: string;
  description: string;
  path: string;
  tone: 'gold' | 'blue';
}

@Component({
  selector: 'app-new-home',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './new-home.component.html',
  styleUrl: './new-home.component.scss',
})
export class NewHomeComponent {
  readonly premiumTiles: LandingOption[] = [
    {
      id: 'codex-command',
      label: 'CEO Command Dashboard',
      description: 'Executive operational posture with strategic project controls and review lanes.',
      path: '/codex-command',
      tone: 'gold',
    },
    {
      id: 'pti-dashboard',
      label: 'PTI Dashboard',
      description: 'Time-tracking and domain productivity for hands-on execution.',
      path: '/new-dashboard',
      tone: 'blue',
    },
  ];

  constructor(private readonly router: Router) {}

  open(path: string): void {
    this.router.navigate([path]);
  }
}
