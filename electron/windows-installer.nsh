!include "getProcessInfo.nsh"

Var pid

!macro customCheckAppRunning
  System::Call 'kernel32::GetCurrentProcessId() i.r0'
  CreateDirectory "$LOCALAPPDATA\${PRODUCT_NAME}"
  FileOpen $1 "$LOCALAPPDATA\${PRODUCT_NAME}\installation-in-progress" a
  FileWrite $1 "$0$\r$\n"
  FileClose $1
  !insertmacro _CHECK_APP_RUNNING
!macroend

!macro customInstall
  Delete "$LOCALAPPDATA\${PRODUCT_NAME}\installation-in-progress"
!macroend
