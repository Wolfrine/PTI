import { bootstrapApplication } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { NewHomeComponent } from './app/components/new-home/new-home.component';

// DEV-ONLY isolated bootstrap: exact production component, no Firebase or auth provider.
document.addEventListener('click', recordClick);
document.addEventListener('auxclick', recordClick);
function recordClick(event: MouseEvent) {
  const link = (event.target as Element | null)?.closest('a');
  if (!link || !link.href.includes('/one-piece/')) return;
  queueMicrotask(() => navigator.sendBeacon('/__events', JSON.stringify({ kind: event.type, href: link.getAttribute('href'), ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, button: event.button, defaultPrevented: event.defaultPrevented })));
}
bootstrapApplication(NewHomeComponent, { providers: [{ provide: Router, useValue: {
  navigateByUrl: async (href: string) => {
    const output = document.getElementById('qa-router-output')!;
    output.textContent = 'Router mock received ' + href;
    output.style.display = 'block';
    navigator.sendBeacon('/__events', JSON.stringify({ kind: 'router-mock', href }));
    return true;
  },
} }] }).catch(error => console.error(error));
