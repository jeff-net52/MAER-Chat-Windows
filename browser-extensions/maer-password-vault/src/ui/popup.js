(function initializePopup(root) {
  'use strict';

  const extensionApi = root.browser || root.chrome;
  const protocol = root.MaerVault && root.MaerVault.Protocol;
  const statusCard = document.querySelector('.status-card');
  const statusTitle = document.getElementById('status-title');
  const statusDetail = document.getElementById('status-detail');
  const originLabel = document.getElementById('origin');
  const refreshButton = document.getElementById('refresh');
  const lockButton = document.getElementById('lock');

  function sendAction(action) {
    const message = { channel: 'maer-password-vault', action, payload: {} };
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

  function activeTab() {
    if (root.browser && root.browser.tabs) {
      return root.browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
    }
    return new Promise((resolve, reject) => {
      extensionApi.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (extensionApi.runtime.lastError) {
          reject(new Error('active tab unavailable'));
          return;
        }
        resolve(tabs && tabs[0]);
      });
    });
  }

  function showLocked(detail) {
    statusCard.dataset.state = 'locked';
    statusTitle.textContent = 'Coffre verrouille';
    statusDetail.textContent = detail || 'Ouvrez MAER Chat pour le deverrouiller';
    lockButton.disabled = true;
  }

  async function refresh() {
    refreshButton.disabled = true;
    statusCard.dataset.state = 'checking';
    statusTitle.textContent = 'Verification...';
    statusDetail.textContent = 'Connexion securisee au client MAER';
    try {
      const tab = await activeTab();
      originLabel.textContent = protocol.originFromUrl(tab.url);
      const response = await sendAction('vault.status');
      if (!response || !response.ok || !response.payload || response.payload.state !== 'ready') {
        showLocked();
        return;
      }
      statusCard.dataset.state = 'ready';
      statusTitle.textContent = 'Coffre deverrouille';
      statusDetail.textContent = 'Pret a remplir apres votre clic';
      lockButton.disabled = false;
    } catch (_error) {
      originLabel.textContent = 'Site HTTP(S) non disponible';
      showLocked('Hote MAER absent ou indisponible');
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function lockVault() {
    lockButton.disabled = true;
    try {
      await sendAction('vault.lock');
    } catch (_error) {
      // Any failure has the same user-visible locked outcome.
    }
    showLocked('Verrouillage demande au client MAER');
  }

  refreshButton.addEventListener('click', refresh);
  lockButton.addEventListener('click', lockVault);
  refresh();
})(globalThis);
