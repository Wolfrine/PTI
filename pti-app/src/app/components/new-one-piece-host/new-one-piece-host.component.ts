import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { OnePieceHostReading, OnePieceHostService } from '../../services/one-piece-host.service';

export function onePieceHostPresentation(reading: OnePieceHostReading) {
  if (reading.status === 'loading') return { label: 'Checking…', detail: 'Checking One Piece on your home PC.', tone: 'neutral' };
  if (reading.status !== 'ready' || !reading.service) return { label: 'Status unavailable', detail: 'Could not check the PC. Check your connection and try again.', tone: 'warning' };
  const service = reading.service;
  if (service.state === 'ready') return { label: 'Ready to watch', detail: 'Your home PC is ready. Open One Piece to watch.', tone: 'ready' };
  if (service.state === 'starting') return { label: 'Starting…', detail: 'Start requested. Waiting for One Piece to connect.', tone: 'neutral' };
  if (service.state === 'starter_offline') return { label: 'Start unavailable', detail: 'Keep your PC awake and connected. Its starter is not responding.', tone: 'warning' };
  if (service.state === 'failed') return { label: 'Could not start', detail: 'Check the One Piece companion on your PC, then try again.', tone: 'warning' };
  return { label: 'Offline', detail: 'Your home PC is connected. Start One Piece when you want to watch.', tone: 'warning' };
}

@Component({
  selector: 'app-new-one-piece-host', standalone: true, imports: [CommonModule],
  templateUrl: './new-one-piece-host.component.html', styleUrl: './new-one-piece-host.component.scss',
})
export class NewOnePieceHostComponent implements OnInit, OnDestroy {
  reading: OnePieceHostReading = { status: 'hidden', service: null, checkedAt: null };
  busy = false;
  requestingStart = false;
  error = '';
  private requestId = '';
  private subscription?: Subscription;
  private destroyed = false;
  constructor(private readonly host: OnePieceHostService) {}
  get presentation() { return onePieceHostPresentation(this.reading); }
  get canStart() { return this.reading.status === 'ready' && this.reading.service?.canStart === true && !this.busy; }
  ngOnInit() { this.subscription = this.host.watch().subscribe(reading => { this.reading = reading; if (reading.status === 'hidden') { this.error = ''; this.requestId = ''; } }); }
  ngOnDestroy() { this.destroyed = true; this.subscription?.unsubscribe(); }
  async start() {
    if (!this.canStart) return;
    this.busy = true; this.requestingStart = true; this.error = ''; this.requestId ||= crypto.randomUUID();
    try { const reading = await this.host.start(this.requestId); if (!this.destroyed && this.reading.status !== 'hidden') { this.reading = reading; this.requestId = ''; } }
    catch { if (!this.destroyed && this.reading.status !== 'hidden') { this.error = 'Start could not be confirmed. Check status before trying again.'; this.reading = { status: 'unavailable', service: null, checkedAt: null }; } }
    finally { this.busy = false; this.requestingStart = false; }
  }
  async refresh() {
    if (this.busy) return;
    this.busy = true; this.error = '';
    try { const reading = await this.host.refresh(); if (!this.destroyed && this.reading.status !== 'hidden') this.reading = reading; }
    catch { if (!this.destroyed && this.reading.status !== 'hidden') this.reading = { status: 'unavailable', service: null, checkedAt: null }; }
    finally { this.busy = false; }
  }
}
