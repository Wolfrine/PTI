import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription } from 'rxjs';
import { NewCodexUsageComponent } from '../new-codex-usage/new-codex-usage.component';
import { NewDevelopmentResourcesComponent } from '../new-development-resources/new-development-resources.component';

type Source = 'codex' | 'github' | 'firebase';

@Component({
  selector: 'app-new-resource-usage',
  standalone: true,
  imports: [CommonModule, MatIconModule, RouterLink, RouterLinkActive, NewCodexUsageComponent, NewDevelopmentResourcesComponent],
  templateUrl: './new-resource-usage.component.html',
  styleUrl: './new-resource-usage.component.scss',
})
export class NewResourceUsageComponent implements OnInit, OnDestroy {
  source: Source = 'codex';
  private routeSubscription?: Subscription;

  constructor(private readonly route: ActivatedRoute, private readonly router: Router) {}

  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const source = params.get('source');
      if (source === 'codex' || source === 'github' || source === 'firebase') this.source = source;
      else void this.router.navigateByUrl('/home', { replaceUrl: true });
    });
  }

  ngOnDestroy(): void { this.routeSubscription?.unsubscribe(); }

  get heading(): string {
    return { codex: 'Codex allowance', github: 'GitHub activity', firebase: 'Firebase usage' }[this.source];
  }

  get description(): string {
    return {
      codex: 'Your connected Codex allowance, reset windows and token history.',
      github: 'Reported repository workflows, failed runs and available Actions billing.',
      firebase: 'Project activity and per-database estimates for confirmed Firestore free-tier limits.',
    }[this.source];
  }

  get platformSource(): 'github' | 'firebase' { return this.source === 'github' ? 'github' : 'firebase'; }
}
