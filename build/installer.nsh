!include "LogicLib.nsh"

!macro customInstall
  nsExec::ExecToStack 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\native-messaging\install-host.ps1" -HostPath "$INSTDIR\resources\native-messaging\maer-password-vault-host.exe"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "L’installation du pont navigateur MAER Password Vault a échoué."
    Abort
  ${EndIf}

  ; Keep Windows Apps & Features metadata aligned with the payload after an
  ; upgrade, even if a previous uninstall entry was retained by Windows.
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "${UNINSTALL_DISPLAY_NAME}"
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion" "${VERSION}"
!macroend

!macro customUnInstall
  nsExec::ExecToStack 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\native-messaging\uninstall-host.ps1"'
  Pop $0
  Pop $1
!macroend
