//! Windows-specific integration: WebView2 runtime check, WebView hardening,
//! and PDF export through WebView2's PrintToPdf.

use tauri::{Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::*;
use webview2_com::PrintToPdfCompletedHandler;
use windows::core::{Interface, HSTRING, PCWSTR, PWSTR};
use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

/// Installed WebView2 runtime version, if any.
pub fn webview2_version() -> Option<String> {
    let mut out = PWSTR::null();
    unsafe {
        GetAvailableCoreWebView2BrowserVersionString(PCWSTR::null(), &mut out).ok()?;
        if out.is_null() {
            return None;
        }
        let s = out.to_string().ok();
        windows::Win32::System::Com::CoTaskMemFree(Some(out.0 as _));
        s
    }
}

pub fn error_box(title: &str, text: &str) {
    unsafe {
        MessageBoxW(
            None,
            &HSTRING::from(text),
            &HSTRING::from(title),
            MB_OK | MB_ICONERROR,
        );
    }
}

/// Production hardening of the embedded browser:
/// no browser context menu, no DevTools, no browser shortcuts (F5, Ctrl+R,
/// Ctrl+Shift+I, browser find/zoom/print — MDVibe implements its own),
/// no status bar, no swipe navigation.
pub fn harden<R: Runtime>(window: &WebviewWindow<R>) {
    let debug = cfg!(debug_assertions);
    let _ = window.with_webview(move |wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else {
            return;
        };
        let Ok(settings) = core.Settings() else {
            return;
        };
        let _ = settings.SetAreDevToolsEnabled(debug);
        let _ = settings.SetAreDefaultContextMenusEnabled(debug);
        let _ = settings.SetIsStatusBarEnabled(false);
        let _ = settings.SetIsZoomControlEnabled(false);
        let _ = settings.SetAreHostObjectsAllowed(false);
        let _ = settings.SetIsBuiltInErrorPageEnabled(false);
        if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
            let _ = s3.SetAreBrowserAcceleratorKeysEnabled(debug);
        }
        if let Ok(s4) = settings.cast::<ICoreWebView2Settings4>() {
            let _ = s4.SetIsGeneralAutofillEnabled(false);
            let _ = s4.SetIsPasswordAutosaveEnabled(false);
        }
        if let Ok(s5) = settings.cast::<ICoreWebView2Settings5>() {
            let _ = s5.SetIsPinchZoomEnabled(false);
        }
        if let Ok(s6) = settings.cast::<ICoreWebView2Settings6>() {
            let _ = s6.SetIsSwipeNavigationEnabled(false);
        }
    });
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOptions {
    /// Page size in millimetres (already oriented).
    pub page_width_mm: f64,
    pub page_height_mm: f64,
    pub margin_mm: f64,
    pub landscape: bool,
    pub backgrounds: bool,
    pub header_footer: bool,
    pub title: String,
}

const MM_PER_INCH: f64 = 25.4;

/// Prints the current page (print stylesheet) to `path`. Resolves when done.
pub async fn print_to_pdf<R: Runtime>(
    window: &WebviewWindow<R>,
    path: std::path::PathBuf,
    opt: PdfOptions,
) -> Result<(), String> {
    let (tx, rx) = tauri::async_runtime::channel::<Result<(), String>>(1);
    let tx_err = tx.clone();
    window
        .with_webview(move |wv| {
            let run = || -> windows::core::Result<()> {
                unsafe {
                    let core = wv.controller().CoreWebView2()?.cast::<ICoreWebView2_7>()?;
                    let env = wv.environment().cast::<ICoreWebView2Environment6>()?;
                    let ps = env.CreatePrintSettings()?;
                    // Width/height are given for the portrait sheet; orientation rotates it.
                    let (w, h) = if opt.landscape {
                        (opt.page_height_mm, opt.page_width_mm)
                    } else {
                        (opt.page_width_mm, opt.page_height_mm)
                    };
                    ps.SetOrientation(if opt.landscape {
                        COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE
                    } else {
                        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT
                    })?;
                    ps.SetPageWidth(w / MM_PER_INCH)?;
                    ps.SetPageHeight(h / MM_PER_INCH)?;
                    let m = opt.margin_mm / MM_PER_INCH;
                    ps.SetMarginTop(m)?;
                    ps.SetMarginBottom(m)?;
                    ps.SetMarginLeft(m)?;
                    ps.SetMarginRight(m)?;
                    ps.SetScaleFactor(1.0)?;
                    ps.SetShouldPrintBackgrounds(opt.backgrounds)?;
                    ps.SetShouldPrintSelectionOnly(false)?;
                    ps.SetShouldPrintHeaderAndFooter(opt.header_footer)?;
                    ps.SetHeaderTitle(&HSTRING::from(opt.title.as_str()))?;
                    ps.SetFooterUri(&HSTRING::from(""))?;
                    let tx = tx.clone();
                    let handler = PrintToPdfCompletedHandler::create(Box::new(move |hr, ok| {
                        let res = match hr {
                            Ok(()) if ok => Ok(()),
                            Ok(()) => Err("The PDF could not be written.".to_string()),
                            Err(e) => Err(e.message().to_string()),
                        };
                        let _ = tx.try_send(res);
                        Ok(())
                    }));
                    core.PrintToPdf(&HSTRING::from(path.as_os_str()), &ps, &handler)?;
                }
                Ok(())
            };
            if let Err(e) = run() {
                let _ = tx_err.try_send(Err(e.message().to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    let mut rx = rx;
    // Guard so a stuck print job never hangs the command forever.
    match tokio::time::timeout(std::time::Duration::from_secs(120), rx.recv()).await {
        Ok(Some(r)) => r,
        Ok(None) => Err("PDF export was interrupted.".into()),
        Err(_) => Err("PDF export timed out.".into()),
    }
}
