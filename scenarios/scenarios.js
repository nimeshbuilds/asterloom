// Optional enhancements only. No analytics or uploads. Checkmarks stay in this browser.
(() => {
  const status = document.querySelector('[data-status]');
  let statusTimer;
  const announce = message => {
    if (!status) return;
    clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = setTimeout(() => { status.textContent = ''; }, 6500);
  };

  const filters = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('[data-category]')];
  for (const button of filters) {
    button.addEventListener('click', () => {
      const category = button.dataset.filter;
      for (const other of filters) other.setAttribute('aria-pressed', String(other === button));
      let count = 0;
      for (const card of cards) {
        card.hidden = category !== 'all' && card.dataset.category !== category;
        if (!card.hidden) count++;
      }
      document.querySelector('[data-filter-count]').textContent = `${count} ${count === 1 ? 'guide' : 'guides'}`;
    });
  }

  const checkboxes = [...document.querySelectorAll('[data-step]')];
  if (checkboxes.length) {
    const key = `asterloom.scenario.v1.${document.body.dataset.scenario}`;
    let storageAvailable = true;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(saved)) {
        for (const box of checkboxes) box.checked = saved.includes(Number(box.dataset.step));
      }
    } catch { storageAvailable = false; }

    const renderProgress = () => {
      const count = checkboxes.filter(box => box.checked).length;
      document.querySelector('[data-progress]').value = count;
      document.querySelector('[data-progress-text]').textContent = `${count} of ${checkboxes.length} steps checked`;
      for (const box of checkboxes) box.closest('li').classList.toggle('is-complete', box.checked);
      document.querySelector('[data-storage-note]').textContent = storageAvailable
        ? 'Saved in this browser. Separate from your game’s progress and XP.'
        : 'Checkmarks work for this visit. This browser could not save them.';
    };
    const save = () => {
      try {
        localStorage.setItem(key, JSON.stringify(checkboxes.filter(box => box.checked).map(box => Number(box.dataset.step))));
        storageAvailable = true;
      } catch { storageAvailable = false; }
      renderProgress();
    };
    for (const box of checkboxes) box.addEventListener('change', () => {
      save();
      if (checkboxes.every(item => item.checked)) announce('Walkthrough complete. Try the source checks, or explore another guide.');
    });
    document.querySelector('[data-reset]').addEventListener('click', () => {
      for (const box of checkboxes) box.checked = false;
      try { localStorage.removeItem(key); storageAvailable = true; } catch { storageAvailable = false; }
      renderProgress();
      announce('This guide’s checkmarks are reset. Your desktop game is unchanged.');
    });
    renderProgress();
  }

  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', async () => {
      const source = document.getElementById(button.dataset.copy);
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(source.textContent);
        announce('Source copied. In Asterloom, choose Paste notes and paste it into Your material.');
      } catch {
        const range = document.createRange();
        range.selectNodeContents(source);
        const selection = window.getSelection();
        source.focus();
        selection.removeAllRanges();
        selection.addRange(range);
        announce('Text selected. Use your device’s Copy command, or download the source file.');
      }
    });
  }
  for (const item of document.querySelectorAll('.js-only')) item.hidden = false;
})();
