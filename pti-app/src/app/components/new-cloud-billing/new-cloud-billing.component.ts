import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Subscription } from 'rxjs';
import { CloudBillingReading, PlatformUsageService, PlatformUsageState } from '../../services/platform-usage.service';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-new-cloud-billing',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './new-cloud-billing.component.html',
  styleUrl: './new-cloud-billing.component.scss',
})
export class NewCloudBillingComponent implements OnInit, OnDestroy {
  state: PlatformUsageState = { status: 'loading', reading: null, fromCache: false };
  now = Date.now();
  private readonly subscriptions = new Subscription();
  private clock?: ReturnType<typeof setInterval>;

  constructor(private readonly usage: PlatformUsageService, @Inject(PLATFORM_ID) private readonly platformId: object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.subscriptions.add(this.usage.watch().subscribe(state => { this.state = state; this.now = Date.now(); }));
    this.clock = setInterval(() => { this.now = Date.now(); }, 60_000);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.clock) clearInterval(this.clock);
  }

  get billing(): CloudBillingReading | null { return this.state.reading?.cloudBilling ?? null; }

  get hasAmounts(): boolean {
    return this.billing?.status === 'ok' && !!this.billing.currency && this.billing.net !== null &&
      this.billing.gross !== null && this.billing.credits !== null && this.billing.otherCharges !== null;
  }

  get reportedStatus(): string {
    if (this.state.status === 'loading') return 'Loading';
    if (this.state.status === 'unconnected' || !this.billing || this.billing.status === 'not-connected') return 'Not connected';
    if (this.state.status === 'unavailable' || this.billing.status === 'error') return 'Unavailable';
    if (this.billing.reason === 'awaiting-export') return 'Awaiting export';
    const at = Date.parse(this.state.reading?.collectedAt ?? '');
    if (!Number.isFinite(at) || this.now - at > STALE_AFTER_MS) return 'Stale';
    return this.state.fromCache ? 'Cached' : 'Current';
  }

  get connectionMessage(): string {
    if (this.billing?.reason === 'awaiting-export') return 'The export is configured, but this invoice month has no rows yet. Google may take time to populate an initial export.';
    if (this.billing?.reason === 'invalid-export-configuration') return 'The private billing export configuration is invalid. Check the BigQuery table, query project and location.';
    if (this.billing?.reason === 'export-query-failed' || this.billing?.reason === 'missing-query-credentials')
      return 'The scheduled collector could not read the billing export. Check dataset permissions and the capped query in GitHub Actions.';
    if (this.state.status === 'loading') return 'Checking the private billing snapshot…';
    if (this.state.status === 'unavailable') return 'The private resource snapshot is currently unavailable.';
    return 'The Standard Cloud Billing export has not been connected to PTI. No actual Google Cloud costs are available yet.';
  }

  get invoiceMonth(): string {
    const month = this.billing?.invoiceMonth;
    return month ? `${month.slice(0, 4)}-${month.slice(4)}` : '—';
  }
}
