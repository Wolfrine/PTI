import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { onePieceEntry } from '../../services/login-return';

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
    { id: 'one-piece', label: 'One Piece', description: 'Family viewing, individual progress and a place to continue the voyage.', path: '/one-piece/', tone: 'blue' },
    { id: 'morsel', label: 'Morsel · Food memory', description: 'Your Zomato history, personal taste and a little help choosing the next meal.', path: 'https://pti-app-2ab59-morsel.web.app/', tone: 'gold' },
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
    if (path === '/one-piece/') { window.location.assign(onePieceEntry(path)); return; }
    if (path === 'https://pti-app-2ab59-morsel.web.app/') { window.location.assign(path); return; }
    this.router.navigate([path]);
  }
}
