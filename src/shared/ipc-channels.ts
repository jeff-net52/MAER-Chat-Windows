export const IPC = {
  bootstrap: 'maer:bootstrap',
  preparePasswordLogin: 'maer:prepare-password-login',
  loadCredential: 'maer:load-credential',
  saveValidatedCredential: 'maer:save-validated-credential',
  forgetCredential: 'maer:forget-credential',
  beginPairing: 'maer:begin-pairing',
  pollPairing: 'maer:poll-pairing',
  cancelPairing: 'maer:cancel-pairing',
} as const
