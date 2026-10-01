; MDVibe installer hooks (included by the Tauri NSIS template).
;
; Policy:
;   * MDVibe registers itself as an *available* handler for Markdown files
;     (Open with list, Default Apps "by app"), but never changes the current
;     default handler of .md / .markdown. The user chooses "Always use this app".
;   * The desktop shortcut is offered, but unchecked by default.
;   * Uninstall removes only MDVibe's own registrations.
;
; All keys live under SHCTX (HKCU for the per-user install mode).

!define MDV_PROGID "MDVibe.Markdown"
!define MDV_CAPS "Software\${MANUFACTURER}\${PRODUCTNAME}\Capabilities"
!define MDV_APPKEY "Software\Classes\Applications\${MAINBINARYNAME}.exe"

; Offer the desktop shortcut on the finish page, unchecked.
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

Var MdvHadDesktopShortcut

!macro MDV_REGISTER_EXT EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MDV_PROGID}" ""
  WriteRegStr SHCTX "${MDV_APPKEY}\SupportedTypes" ".${EXT}" ""
  WriteRegStr SHCTX "${MDV_CAPS}\FileAssociations" ".${EXT}" "${MDV_PROGID}"
!macroend

!macro MDV_UNREGISTER_EXT EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${MDV_PROGID}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}"
!macroend

!macro NSIS_HOOK_PREINSTALL
  StrCpy $MdvHadDesktopShortcut 0
  SetShellVarContext current
  ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
    StrCpy $MdvHadDesktopShortcut 1
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; ProgID used by Open with / Default Apps.
  WriteRegStr SHCTX "Software\Classes\${MDV_PROGID}" "" "Markdown Document"
  WriteRegStr SHCTX "Software\Classes\${MDV_PROGID}" "FriendlyTypeName" "Markdown Document"
  WriteRegStr SHCTX "Software\Classes\${MDV_PROGID}\DefaultIcon" "" "$\"$INSTDIR\md-document.ico$\""
  WriteRegStr SHCTX "Software\Classes\${MDV_PROGID}\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\${MDV_PROGID}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

  ; Application registration (Open with → Choose another app).
  WriteRegStr SHCTX "${MDV_APPKEY}" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${MDV_APPKEY}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "${MDV_APPKEY}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

  ; Default Apps → "Set defaults by app".
  WriteRegStr SHCTX "${MDV_CAPS}" "ApplicationName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${MDV_CAPS}" "ApplicationDescription" "Fast, clean Markdown viewer"
  WriteRegStr SHCTX "${MDV_CAPS}" "ApplicationIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
  WriteRegStr SHCTX "Software\RegisteredApplications" "${PRODUCTNAME}" "${MDV_CAPS}"

  !insertmacro MDV_REGISTER_EXT "md"
  !insertmacro MDV_REGISTER_EXT "markdown"
  !insertmacro MDV_REGISTER_EXT "mdown"
  !insertmacro MDV_REGISTER_EXT "mkd"

  ; SHCNE_ASSOCCHANGED: let Explorer pick up the new handler.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ; Silent/passive installs skip the finish page and the template then always
  ; creates a desktop shortcut. Keep the opt-in policy: remove it unless it
  ; existed before this install.
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${If} $MdvHadDesktopShortcut = 0
      SetShellVarContext current
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; During an upgrade the old uninstaller runs in update mode: keep registrations.
  ${If} $UpdateMode <> 1
    !insertmacro MDV_UNREGISTER_EXT "md"
    !insertmacro MDV_UNREGISTER_EXT "markdown"
    !insertmacro MDV_UNREGISTER_EXT "mdown"
    !insertmacro MDV_UNREGISTER_EXT "mkd"
    DeleteRegKey SHCTX "Software\Classes\${MDV_PROGID}"
    DeleteRegKey SHCTX "${MDV_APPKEY}"
    DeleteRegValue SHCTX "Software\RegisteredApplications" "${PRODUCTNAME}"
    DeleteRegKey SHCTX "${MDV_CAPS}"
    DeleteRegKey /ifempty SHCTX "Software\${MANUFACTURER}\${PRODUCTNAME}"
    DeleteRegKey /ifempty SHCTX "Software\${MANUFACTURER}"
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
!macroend
