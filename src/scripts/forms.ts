// Small form conveniences used across pages.

// <form data-confirm="…">: ask before submitting an action with consequences.
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-confirm]')) {
  form.addEventListener('submit', (event) => {
    if (!confirm(form.dataset.confirm ?? 'Opravdu?')) event.preventDefault();
  });
}

// <form data-busy-label="…">: show progress for slower actions (sending email, fetching content)
// and prevent double submission.
for (const form of document.querySelectorAll<HTMLFormElement>('form[data-busy-label]')) {
  form.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (!button) return;
    // Disable after the submission has started, so the form data still includes the button.
    setTimeout(() => {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = form.dataset.busyLabel ?? 'Probíhá…';
    });
  });
}
