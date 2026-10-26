import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { GtopHostReading, GtopHostService } from '../../services/gtop-host.service';

export function hostPresentation(reading: GtopHostReading) {
  if (reading.status === 'loading') return { label: 'Checking…', detail: 'Checking the assistant on your PC.', tone: 'neutral' };
  if (reading.status !== 'ready' || !reading.service) return { label: 'Status unavailable', detail: 'Could not check the PC. Check your connection and try again.', tone: 'warning' };
  const service = reading.service;
  if (service.state === 'ready') return { label: 'Available', detail: service.worker.modelReady ? 'Ready for conversations and question papers.' : 'Connected. The model loads when a request arrives.', tone: 'ready' };
  if (service.state === 'starting') return { label: 'Starting…', detail: 'Start requested. Waiting for the assistant to connect.', tone: 'neutral' };
  if (service.state === 'starter_offline') return { label: 'Start unavailable', detail: 'Keep your PC awake and connected. Its starter is not responding.', tone: 'warning' };
  if (service.state === 'failed') return { label: 'Could not start', detail: service.request?.errorCode === 'model_unavailable' ? 'The local model is unavailable. Check Ollama on the PC, then try again.' : 'Check the assistant setup on your PC, then try again.', tone: 'warning' };
  return { label: 'Offline', detail: 'Your PC is connected. Start the assistant when you need it.', tone: 'warning' };
}

@Component({
  selector: 'app-new-gtop-host', standalone: true, imports: [CommonModule],
  templateUrl: './new-gtop-host.component.html', styleUrl: './new-gtop-host.component.scss',
})
export class NewGtopHostComponent implements OnInit, OnDestroy {
  reading: GtopHostReading = { status: 'hidden', service: null, checkedAt: null };
  busy = false;
  requestingStart = false;
  error = '';
  private requestId = '';
  private subscription?: Subscription;
  private destroyed = false;
  constructor(private readonly host: GtopHostService) {}
  get presentation() { return hostPresentation(this.reading); }
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
