(function initializeContentScript(root) {
  'use strict';

  const extensionApi = root.browser || root.chrome;
  if (!extensionApi || !extensionApi.runtime || root.top !== root.self) {
    return;
  }

  const host = document.createElement('div');
  host.id = 'maer-password-vault-root';
  host.setAttribute('data-maer-owned', 'true');
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; color-scheme: dark; }
    * { box-sizing: border-box; }
    button { font: inherit; }
    .launcher {
      position: fixed; z-index: 2147483646; width: 32px; height: 32px;
      display: none; place-items: center; border: 1px solid rgba(117, 246, 255, .5);
      border-radius: 10px; color: #071419; background: linear-gradient(145deg, #51f59a, #4de1ff);
      box-shadow: 0 8px 22px rgba(0, 0, 0, .34); cursor: pointer;
      font: 800 14px/1 system-ui, sans-serif; transition: transform .16s ease, box-shadow .16s ease;
    }
    .launcher:hover, .launcher:focus-visible { transform: translateY(-1px) scale(1.04); box-shadow: 0 10px 26px rgba(77, 225, 255, .24); outline: none; }
    .launcher[data-has-value="true"]::after {
      content: ''; position: absolute; right: -2px; top: -2px; width: 9px; height: 9px;
      border: 2px solid #13232b; border-radius: 50%; background: #ffab5c;
    }
    .panel {
      position: fixed; z-index: 2147483647; width: min(370px, calc(100vw - 24px));
      max-height: min(560px, calc(100vh - 24px)); overflow: hidden; display: none;
      border: 1px solid #30434c; border-radius: 18px; color: #ecf7fa;
      background: #111f26; box-shadow: 0 24px 70px rgba(0, 0, 0, .55);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .panel[data-open="true"] { display: block; animation: enter .14s ease-out; }
    @keyframes enter { from { opacity: 0; transform: translateY(5px) scale(.985); } }
    .header { display: flex; align-items: center; gap: 12px; padding: 16px 16px 14px; border-bottom: 1px solid #2a3b43; background: #16282f; }
    .mark { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 13px; color: #071419; background: linear-gradient(145deg, #51f59a, #4de1ff); font: 900 18px/1 system-ui, sans-serif; }
    .heading { min-width: 0; flex: 1; }
    .title { margin: 0; font-size: 15px; font-weight: 760; letter-spacing: .01em; }
    .subtitle { margin: 2px 0 0; color: #9eb0b7; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .close { width: 32px; height: 32px; border: 0; border-radius: 10px; color: #aebdc2; background: transparent; cursor: pointer; }
    .close:hover, .close:focus-visible { color: #fff; background: #263a43; outline: none; }
    .body { max-height: 370px; padding: 14px; overflow: auto; scrollbar-color: #3a525d transparent; }
    .state { display: flex; align-items: center; gap: 9px; min-height: 36px; padding: 9px 11px; border-radius: 12px; color: #b8c8cd; background: #172a32; }
    .state-dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: #70848c; }
    .state[data-kind="ready"] .state-dot { background: #51f59a; box-shadow: 0 0 0 4px rgba(81, 245, 154, .1); }
    .state[data-kind="warning"] .state-dot { background: #ffab5c; }
    .state[data-kind="locked"] .state-dot { background: #ff7285; }
    .entries { display: grid; gap: 8px; margin-top: 12px; }
    .entry { width: 100%; display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 10px; padding: 10px; border: 1px solid #2d414a; border-radius: 13px; color: #edf8fb; text-align: left; background: #1a2c34; cursor: pointer; }
    .entry:hover, .entry:focus-visible { border-color: #4de1ff; background: #203740; outline: none; }
    .entry-avatar { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 12px; color: #51f59a; background: #0d2027; font-weight: 800; }
    .entry-copy { min-width: 0; }
    .entry-label, .entry-user { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .entry-label { font-weight: 720; }
    .entry-user { color: #9eb0b7; font-size: 12px; }
    .entry-arrow { color: #4de1ff; font-size: 18px; }
    .empty { padding: 20px 12px 8px; color: #9eb0b7; text-align: center; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin-top: 13px; }
    .action { min-height: 42px; padding: 9px 11px; border: 1px solid #35505a; border-radius: 12px; color: #dcebee; background: #1c3038; cursor: pointer; }
    .action:hover, .action:focus-visible { border-color: #51f59a; color: #fff; outline: none; }
    .action.primary { border-color: transparent; color: #071419; background: linear-gradient(145deg, #51f59a, #4de1ff); font-weight: 760; }
    .action:disabled { opacity: .45; cursor: default; }
    .privacy { margin: 13px 2px 1px; color: #738a93; font-size: 11px; text-align: center; }
    .toast { position: fixed; z-index: 2147483647; left: 50%; bottom: 22px; display: none; width: min(430px, calc(100vw - 24px)); align-items: center; gap: 12px; padding: 12px 13px 12px 15px; border: 1px solid #344b55; border-radius: 14px; color: #eef9fb; background: #14262e; box-shadow: 0 16px 46px rgba(0, 0, 0, .46); transform: translateX(-50%); font: 14px/1.4 system-ui, sans-serif; }
    .toast[data-open="true"] { display: flex; }
    .toast-message { flex: 1; }
    .toast-action { min-height: 34px; padding: 6px 11px; border: 0; border-radius: 9px; color: #071419; background: #51f59a; font-weight: 750; cursor: pointer; }
    .toast-dismiss { width: 30px; height: 30px; border: 0; border-radius: 8px; color: #9eb0b7; background: transparent; cursor: pointer; }
    @media (prefers-reduced-motion: reduce) { .panel[data-open="true"] { animation: none; } .launcher { transition: none; } }
  `;

  const launcher = document.createElement('button');
  launcher.className = 'launcher';
  launcher.type = 'button';
  launcher.textContent = 'M';
  launcher.setAttribute('aria-label', 'Ouvrir le coffre de mots de passe MAER');

  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Coffre de mots de passe MAER');

  const header = document.createElement('header');
  header.className = 'header';
  const mark = document.createElement('div');
  mark.className = 'mark';
  mark.textContent = 'M';
  const heading = document.createElement('div');
  heading.className = 'heading';
  const title = document.createElement('p');
  title.className = 'title';
  title.textContent = 'Coffre MAER';
  const subtitle = document.createElement('p');
  subtitle.className = 'subtitle';
  const closeButton = document.createElement('button');
  closeButton.className = 'close';
  closeButton.type = 'button';
  closeButton.textContent = 'X';
  closeButton.setAttribute('aria-label', 'Fermer');
  heading.append(title, subtitle);
  header.append(mark, heading, closeButton);

  const body = document.createElement('div');
  body.className = 'body';
  const state = document.createElement('div');
  state.className = 'state';
  const stateDot = document.createElement('span');
  stateDot.className = 'state-dot';
  const stateText = document.createElement('span');
  state.append(stateDot, stateText);
  const entries = document.createElement('div');
  entries.className = 'entries';
  const actions = document.createElement('div');
  actions.className = 'actions';
  const generateButton = document.createElement('button');
  generateButton.className = 'action';
  generateButton.type = 'button';
  generateButton.textContent = 'Generer';
  const saveButton = document.createElement('button');
  saveButton.className = 'action primary';
  saveButton.type = 'button';
  saveButton.textContent = 'Enregistrer';
  const privacy = document.createElement('p');
  privacy.className = 'privacy';
  privacy.textContent = 'Aucun secret conserve par l extension';
  actions.append(generateButton, saveButton);
  body.append(state, entries, actions, privacy);
  panel.append(header, body);

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  const toastMessage = document.createElement('span');
  toastMessage.className = 'toast-message';
  const toastAction = document.createElement('button');
  toastAction.className = 'toast-action';
  toastAction.type = 'button';
  toastAction.textContent = 'Enregistrer';
  const toastDismiss = document.createElement('button');
  toastDismiss.className = 'toast-dismiss';
  toastDismiss.type = 'button';
  toastDismiss.textContent = 'X';
  toastDismiss.setAttribute('aria-label', 'Ignorer');
  toast.append(toastMessage, toastAction, toastDismiss);

  shadow.append(style, launcher, panel, toast);
  (document.documentElement || document.body).appendChild(host);

  let activePassword = null;
  let transientCandidate = null;
  let candidateTimer = null;
  let toastTimer = null;

  function isPasswordField(value) {
    return value instanceof HTMLInputElement && value.type === 'password' && !value.disabled && !value.readOnly;
  }

  function containingForm(field) {
    return field && (field.form || field.closest('form'));
  }

  function usernameFieldFor(passwordField) {
    const scope = containingForm(passwordField) || document;
    const candidates = Array.from(scope.querySelectorAll('input:not([type="password"]):not([type="hidden"]):not([disabled]):not([readonly])'));
    return candidates.find((field) => field.autocomplete === 'username') ||
      candidates.find((field) => field.type === 'email') ||
      candidates.find((field) => field.type === 'text' || field.type === 'email') || null;
  }

  function formSignature(passwordField) {
    const form = containingForm(passwordField);
    if (!form) {
      return 'none:password';
    }
    const fields = Array.from(form.querySelectorAll('input')).slice(0, 20).map((field) => {
      const type = String(field.type || 'text').slice(0, 24);
      const autocomplete = String(field.autocomplete || 'none').slice(0, 32);
      return `${type}/${autocomplete}`;
    });
    return `${String(form.method || 'get').toLowerCase()}:${fields.join(',')}`.slice(0, 256);
  }

  function currentCredentials(formOverride) {
    const form = formOverride || containingForm(activePassword);
    const passwordField = activePassword && (!form || containingForm(activePassword) === form)
      ? activePassword
      : form && form.querySelector('input[type="password"]');
    if (!passwordField || !passwordField.value) {
      return null;
    }
    const usernameField = usernameFieldFor(passwordField);
    return {
      username: usernameField ? String(usernameField.value).slice(0, 320) : '',
      password: String(passwordField.value).slice(0, 4096),
      label: String(document.title || location.hostname).slice(0, 256)
    };
  }

  function clearCandidate() {
    if (candidateTimer) {
      root.clearTimeout(candidateTimer);
      candidateTimer = null;
    }
    if (transientCandidate) {
      transientCandidate.username = '';
      transientCandidate.password = '';
      transientCandidate.label = '';
      transientCandidate = null;
    }
  }

  function sendAction(action, payload) {
    const message = { channel: 'maer-password-vault', action, payload: payload || {} };
    if (root.browser && root.browser.runtime) {
      return root.browser.runtime.sendMessage(message);
    }
    return new Promise((resolve, reject) => {
      try {
        extensionApi.runtime.sendMessage(message, (response) => {
          if (extensionApi.runtime.lastError) {
            reject(new Error('vault unavailable'));
            return;
          }
          resolve(response);
        });
      } catch (_error) {
        reject(new Error('vault unavailable'));
      }
    });
  }

  function setState(kind, message) {
    state.dataset.kind = kind;
    stateText.textContent = message;
  }

  function clearEntries() {
    while (entries.firstChild) {
      entries.firstChild.remove();
    }
  }

  function addEmpty(message) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = message;
    entries.appendChild(empty);
  }

  function setNativeInputValue(field, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(field, value);
    } else {
      field.value = value;
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function showToast(message, actionVisible) {
    if (toastTimer) {
      root.clearTimeout(toastTimer);
    }
    toastMessage.textContent = message;
    toastAction.hidden = !actionVisible;
    toast.dataset.open = 'true';
    toastTimer = root.setTimeout(() => {
      toast.dataset.open = 'false';
      if (actionVisible) {
        clearCandidate();
      }
    }, actionVisible ? 30000 : 4500);
  }

  function hideToast() {
    if (toastTimer) {
      root.clearTimeout(toastTimer);
      toastTimer = null;
    }
    toast.dataset.open = 'false';
  }

  async function revealAndFill(entry) {
    if (!activePassword || !activePassword.isConnected) {
      return;
    }
    setState('warning', 'Ouverture securisee...');
    try {
      const response = await sendAction('vault.reveal', { credentialId: entry.credentialId });
      if (!response || !response.ok || !response.payload || typeof response.payload.password !== 'string') {
        throw new Error('vault locked');
      }
      let password = response.payload.password;
      let username = typeof response.payload.username === 'string' ? response.payload.username : '';
      const targetPassword = activePassword;
      const targetUsername = usernameFieldFor(targetPassword);
      if (targetUsername && username) {
        setNativeInputValue(targetUsername, username);
      }
      setNativeInputValue(targetPassword, password);
      password = '';
      username = '';
      response.payload.password = '';
      response.payload.username = '';
      panel.dataset.open = 'false';
      showToast('Identifiants remplis par MAER', false);
    } catch (_error) {
      setState('locked', 'Coffre indisponible ou verrouille');
    }
  }

  function renderEntries(items) {
    clearEntries();
    if (!items.length) {
      addEmpty('Aucun identifiant pour ce site');
      return;
    }
    for (const entry of items) {
      const button = document.createElement('button');
      button.className = 'entry';
      button.type = 'button';
      const avatar = document.createElement('span');
      avatar.className = 'entry-avatar';
      avatar.textContent = (entry.username || entry.label || '?').slice(0, 1).toUpperCase();
      const copy = document.createElement('span');
      copy.className = 'entry-copy';
      const label = document.createElement('span');
      label.className = 'entry-label';
      label.textContent = entry.label || location.hostname;
      const user = document.createElement('span');
      user.className = 'entry-user';
      user.textContent = entry.username || 'Sans identifiant';
      const arrow = document.createElement('span');
      arrow.className = 'entry-arrow';
      arrow.textContent = '›';
      copy.append(label, user);
      button.append(avatar, copy, arrow);
      button.addEventListener('click', () => revealAndFill(entry));
      entries.appendChild(button);
    }
  }

  async function lookup() {
    if (!activePassword || !activePassword.isConnected) {
      return;
    }
    clearEntries();
    setState('warning', 'Connexion au coffre MAER...');
    const usernameField = usernameFieldFor(activePassword);
    try {
      const response = await sendAction('vault.lookup', {
        usernameHint: usernameField ? String(usernameField.value).slice(0, 320) : '',
        formSignature: formSignature(activePassword)
      });
      if (!response || !response.ok || !response.payload || !Array.isArray(response.payload.entries)) {
        throw new Error('vault locked');
      }
      setState('ready', 'Coffre deverrouille');
      renderEntries(response.payload.entries);
    } catch (_error) {
      setState('locked', 'Coffre indisponible ou verrouille');
      addEmpty('Deverrouillez le coffre dans MAER Chat');
    }
  }

  function positionInterface() {
    if (!activePassword || !activePassword.isConnected) {
      launcher.style.display = 'none';
      panel.dataset.open = 'false';
      return;
    }
    const rectangle = activePassword.getBoundingClientRect();
    if (rectangle.width === 0 || rectangle.height === 0 || rectangle.bottom < 0 || rectangle.top > root.innerHeight) {
      launcher.style.display = 'none';
      return;
    }
    const launcherLeft = Math.max(6, Math.min(root.innerWidth - 38, rectangle.right - 38));
    const launcherTop = Math.max(6, Math.min(root.innerHeight - 38, rectangle.top + ((rectangle.height - 32) / 2)));
    launcher.style.left = `${launcherLeft}px`;
    launcher.style.top = `${launcherTop}px`;
    launcher.style.display = 'grid';
    launcher.dataset.hasValue = activePassword.value ? 'true' : 'false';

    const panelWidth = Math.min(370, root.innerWidth - 24);
    const panelLeft = Math.max(12, Math.min(root.innerWidth - panelWidth - 12, rectangle.right - panelWidth));
    const preferredTop = rectangle.bottom + 9;
    const panelTop = preferredTop + 520 < root.innerHeight ? preferredTop : Math.max(12, rectangle.top - 530);
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
  }

  async function generatePassword() {
    if (!activePassword || !activePassword.isConnected) {
      return;
    }
    generateButton.disabled = true;
    setState('warning', 'Generation securisee...');
    try {
      const response = await sendAction('vault.generate', {
        policy: { length: 20, lowercase: true, uppercase: true, digits: true, symbols: true }
      });
      if (!response || !response.ok || !response.payload || typeof response.payload.password !== 'string') {
        throw new Error('vault locked');
      }
      let password = response.payload.password;
      setNativeInputValue(activePassword, password);
      password = '';
      response.payload.password = '';
      launcher.dataset.hasValue = 'true';
      setState('ready', 'Mot de passe genere et insere');
    } catch (_error) {
      setState('locked', 'Coffre indisponible ou verrouille');
    } finally {
      generateButton.disabled = false;
    }
  }

  async function saveCredentials(candidateOverride) {
    const candidate = candidateOverride || currentCredentials();
    if (!candidate || !candidate.password) {
      setState('warning', 'Saisissez d abord un mot de passe');
      return;
    }
    saveButton.disabled = true;
    try {
      const response = await sendAction('vault.save', candidate);
      if (!response || !response.ok) {
        throw new Error('vault locked');
      }
      setState('ready', 'Identifiants enregistres');
      hideToast();
      showToast('Identifiants enregistres dans le coffre MAER', false);
    } catch (_error) {
      setState('locked', 'Coffre indisponible ou verrouille');
      showToast('Enregistrement impossible - coffre verrouille', false);
    } finally {
      candidate.username = '';
      candidate.password = '';
      candidate.label = '';
      if (candidate === transientCandidate) {
        transientCandidate = null;
      }
      saveButton.disabled = false;
    }
  }

  function proposeSave(form) {
    clearCandidate();
    transientCandidate = currentCredentials(form);
    if (!transientCandidate) {
      return;
    }
    showToast('Enregistrer ces identifiants dans MAER ?', true);
    candidateTimer = root.setTimeout(clearCandidate, 30000);
  }

  launcher.addEventListener('pointerdown', (event) => event.preventDefault());
  launcher.addEventListener('click', () => {
    panel.dataset.open = panel.dataset.open === 'true' ? 'false' : 'true';
    subtitle.textContent = location.hostname;
    saveButton.disabled = !currentCredentials();
    positionInterface();
    if (panel.dataset.open === 'true') {
      lookup();
    }
  });
  closeButton.addEventListener('click', () => { panel.dataset.open = 'false'; });
  generateButton.addEventListener('click', generatePassword);
  saveButton.addEventListener('click', () => saveCredentials(null));
  toastAction.addEventListener('click', () => {
    if (transientCandidate) {
      saveCredentials(transientCandidate);
    }
  });
  toastDismiss.addEventListener('click', () => {
    hideToast();
    clearCandidate();
  });

  document.addEventListener('focusin', (event) => {
    if (isPasswordField(event.target)) {
      activePassword = event.target;
      positionInterface();
    }
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target === activePassword) {
      launcher.dataset.hasValue = activePassword.value ? 'true' : 'false';
      saveButton.disabled = !activePassword.value;
    }
  }, true);
  document.addEventListener('submit', (event) => proposeSave(event.target), true);
  document.addEventListener('pointerdown', (event) => {
    if (panel.dataset.open === 'true' && !host.contains(event.target) && event.target !== activePassword) {
      panel.dataset.open = 'false';
    }
  }, true);
  root.addEventListener('resize', positionInterface, { passive: true });
  root.addEventListener('scroll', positionInterface, { passive: true, capture: true });
  root.addEventListener('pagehide', clearCandidate);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearCandidate();
      panel.dataset.open = 'false';
    }
  });

  const observer = new MutationObserver(() => {
    if (activePassword && !activePassword.isConnected) {
      activePassword = null;
      launcher.style.display = 'none';
      panel.dataset.open = 'false';
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})(globalThis);
