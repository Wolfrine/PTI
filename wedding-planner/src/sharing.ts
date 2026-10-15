import './sharing.css';

const invitation = {
  title: 'Mahima & Mayank · 18–20 January 2027',
  text: 'Celebrations planned for 18–20 January 2027. We look forward to celebrating with you.',
  url: 'https://mahima-mayank.web.app/',
};

const announce = (message: string) => {
  const status = document.querySelector<HTMLElement>('#share-status');
  if (status) status.textContent = message;
};

function showLink() {
  let dialog = document.querySelector<HTMLDialogElement>('#share-link-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'share-link-dialog';
    dialog.className = 'share-link-dialog';
    dialog.setAttribute('aria-labelledby', 'share-link-heading');
    dialog.innerHTML = '<h2 id="share-link-heading">Share the invitation</h2><p>Copy this public link and send it to your loved ones.</p><label for="invitation-link">Invitation link</label><input id="invitation-link" readonly type="url"><form method="dialog"><button class="button button-secondary">Done</button></form>';
    dialog.querySelector<HTMLInputElement>('input')!.value = invitation.url;
    document.body.append(dialog);
  }
  dialog.showModal();
  dialog.querySelector<HTMLInputElement>('input')!.select();
}

document.addEventListener('click', async event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-share-invitation]');
  if (!button || button.disabled) return;
  button.disabled = true;
  announce('');
  try {
    if (navigator.share) {
      try {
        await navigator.share(invitation);
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(invitation.url);
      announce('Invitation link copied.');
    } catch {
      showLink();
    }
  } finally {
    button.disabled = false;
  }
});
