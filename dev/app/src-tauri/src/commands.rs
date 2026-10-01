//! IPC surface exposed to the renderer. Kept deliberately small: every command
//! validates its input and never runs a shell or executes local files.
//! The allow-list lives in `build.rs` (app manifest) + `capabilities/default.json`.

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

use crate::document::{self, DocumentError, LoadedDocument, MARKDOWN_EXTENSIONS};
use crate::links::{self, LinkTarget};
use crate::recent::RecentView;
use crate::{instance, watcher, AppState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupInfo {
    pub product_name: String,
    pub version: String,
    pub platform: &'static str,
    pub debug: bool,
    pub launch_file: Option<String>,
    pub settings: Value,
    pub image_base: &'static str,
    pub webview_version: Option<String>,
    pub log_dir: String,
}

#[tauri::command]
pub fn startup_info<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> StartupInfo {
    let info = app.package_info();
    StartupInfo {
        product_name: info.name.clone(),
        version: info.version.to_string(),
        platform: std::env::consts::OS,
        debug: cfg!(debug_assertions),
        launch_file: state.take_launch_file().map(|p| document::display_path(&p)),
        settings: state.settings.load(),
        image_base: if cfg!(windows) {
            "http://mdimg.localhost/"
        } else {
            "mdimg://localhost/"
        },
        #[cfg(windows)]
        webview_version: crate::win::webview2_version(),
        #[cfg(not(windows))]
        webview_version: None,
        log_dir: document::display_path(&state.log_dir),
    }
}

/// Opens `path` in *this* window (only used while the window has no document,
/// or to reload the same document).
#[tauri::command]
pub fn open_document<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    path: String,
) -> Result<LoadedDocument, DocumentError> {
    let requested = PathBuf::from(&path);
    let path = document::canonical(&requested).unwrap_or(requested);
    let doc = document::load(&path)?;
    let is_new = state.doc_path().as_deref() != Some(path.as_path());
    if is_new {
        state.set_doc(Some(path.clone()));
        start_doc_watch(&window, &state, &path);
        if state.settings.remember_recent() {
            state.recent.add(&doc.path);
        }
        let product = window.app_handle().package_info().name.clone();
        let _ = window.set_title(&format!("{} — {}", doc.name, product));
    }
    Ok(doc)
}

#[tauri::command]
pub fn reload_document(state: State<'_, AppState>) -> Result<LoadedDocument, DocumentError> {
    let Some(path) = state.doc_path() else {
        return Err(DocumentError {
            kind: document::ErrorKind::NotFound,
            path: String::new(),
            detail: "no document".into(),
        });
    };
    document::load(&path)
}

fn start_doc_watch<R: Runtime>(window: &WebviewWindow<R>, state: &AppState, path: &Path) {
    let Some(dir) = path.parent() else { return };
    let win = window.clone();
    let res = watcher::watch_files(dir, vec![path.to_path_buf()], move |p| {
        #[derive(Serialize, Clone)]
        struct Changed {
            exists: bool,
        }
        let _ = win.emit_to(
            win.label(),
            "doc-changed",
            Changed {
                exists: p.is_file(),
            },
        );
    });
    match res {
        Ok(w) => state.set_doc_watcher(Some(w)),
        Err(e) => {
            log::warn!("file watching unavailable: {e}");
            state.set_doc_watcher(None);
        }
    }
}

/// Native "Open" dialog. Returns the chosen path; the renderer decides whether
/// to open it here (empty window) or in a new instance.
#[tauri::command]
pub async fn pick_markdown_file<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .add_filter("Markdown", MARKDOWN_EXTENSIONS)
        .add_filter("All files", &["*"]);
    if let Some(dir) = state.doc_dir() {
        dialog = dialog.set_directory(dir);
    }
    dialog.pick_file(move |f| {
        let _ = tx.try_send(f.and_then(|p| p.into_path().ok()));
    });
    Ok(rx
        .recv()
        .await
        .flatten()
        .map(|p| document::display_path(&p)))
}

/// Top-left corner of this window, so the next instance opens cascaded.
fn origin_of<R: Runtime>(window: &WebviewWindow<R>) -> Option<(i32, i32)> {
    if window.is_maximized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return None;
    }
    window.outer_position().ok().map(|p| (p.x, p.y))
}

/// Starts an independent MDVibe instance (optionally with a document).
#[tauri::command]
pub fn open_in_new_window<R: Runtime>(
    window: WebviewWindow<R>,
    path: Option<String>,
) -> Result<(), String> {
    let origin = origin_of(&window);
    match path {
        None => instance::spawn(None, origin),
        Some(p) => {
            let p = PathBuf::from(p);
            if !p.is_file() {
                return Err("The file does not exist.".into());
            }
            instance::spawn(Some(&p), origin)
        }
    }
}

/// Handles a clicked link according to the link policy (see links.rs).
#[tauri::command]
pub fn activate_link<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    href: String,
) -> Result<LinkTarget, String> {
    let base = state.doc_dir();
    let target = links::classify(&href, base.as_deref());
    match &target {
        LinkTarget::External { url } => open_url(url)?,
        LinkTarget::Markdown { path, .. } => {
            instance::spawn(Some(Path::new(path)), origin_of(&window))?
        }
        _ => {}
    }
    Ok(target)
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    open_url(&url)
}

fn open_url(url: &str) -> Result<(), String> {
    if !links::is_safe_external(url) {
        return Err("Only web and e-mail links can be opened.".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reveal_in_folder(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let current = state.doc_path();
    let allowed = links::network_path_allowed(&p, state.doc_dir().as_deref())
        || current.as_deref() == Some(p.as_path());
    if !allowed {
        return Err("Network locations on other computers are not opened.".into());
    }
    if !p.exists() {
        return Err("The file no longer exists.".into());
    }
    tauri_plugin_opener::reveal_item_in_dir(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_save(state: State<'_, AppState>, settings: Value) -> Result<(), String> {
    state.settings.save(&settings)
}

#[tauri::command]
pub fn recent_list(state: State<'_, AppState>) -> Vec<RecentView> {
    state.recent.list()
}

#[tauri::command]
pub fn recent_remove(state: State<'_, AppState>, path: String) {
    state.recent.remove(&path);
}

#[tauri::command]
pub fn recent_set_pinned(state: State<'_, AppState>, path: String, pinned: bool) {
    state.recent.set_pinned(&path, pinned);
}

#[tauri::command]
pub fn recent_clear(state: State<'_, AppState>) {
    state.recent.clear();
}

/// "Save as PDF…": asks for a destination, then prints the print stylesheet to PDF.
/// Returns the saved path, or `None` when the user cancelled.
#[tauri::command]
pub async fn export_pdf<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    options: Value,
) -> Result<Option<String>, String> {
    let doc = state.doc_path().ok_or("No document is open.")?;
    let stem = doc
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".into());
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_file_name(format!("{stem}.pdf"))
        .add_filter("PDF", &["pdf"]);
    if let Some(dir) = doc.parent() {
        dialog = dialog.set_directory(dir);
    }
    dialog.save_file(move |f| {
        let _ = tx.try_send(f.and_then(|p| p.into_path().ok()));
    });
    let Some(mut dest) = rx.recv().await.flatten() else {
        return Ok(None);
    };
    if dest.extension().is_none() {
        dest.set_extension("pdf");
    }
    #[cfg(windows)]
    {
        let opt: crate::win::PdfOptions =
            serde_json::from_value(options).map_err(|e| format!("invalid PDF options: {e}"))?;
        crate::win::print_to_pdf(&window, dest.clone(), opt)
            .await
            .map_err(|e| {
                log::error!("PDF export failed: {e}");
                e
            })?;
        log::info!("PDF exported");
        Ok(Some(document::display_path(&dest)))
    }
    #[cfg(not(windows))]
    {
        let _ = (options, dest);
        Err("Save as PDF is not available on this platform yet. Use Print → Save as PDF.".into())
    }
}

#[tauri::command]
pub fn log_message(level: String, message: String) {
    let msg: String = message.chars().take(2000).collect();
    match level.as_str() {
        "error" => log::error!("renderer: {msg}"),
        "warn" => log::warn!("renderer: {msg}"),
        _ => log::info!("renderer: {msg}"),
    }
}

#[tauri::command]
pub fn open_log_folder(state: State<'_, AppState>) -> Result<(), String> {
    let _ = std::fs::create_dir_all(&state.log_dir);
    tauri_plugin_opener::open_path(&state.log_dir, None::<&str>).map_err(|e| e.to_string())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyMetrics {
    pub render_ms: Option<f64>,
    pub doc_bytes: Option<u64>,
}

/// Called once after the first paint: shows the window (avoids a white flash)
/// and records startup timing.
#[tauri::command]
pub fn app_ready<R: Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    metrics: ReadyMetrics,
) {
    let startup_ms = state.started.elapsed().as_millis();
    let _ = window.show();
    let _ = window.set_focus();
    log::info!(
        "ready: startup={}ms render={}ms bytes={}",
        startup_ms,
        metrics.render_ms.map(|v| v.round() as i64).unwrap_or(-1),
        metrics.doc_bytes.unwrap_or(0)
    );
    if let Ok(file) = std::env::var("MDVIBE_BENCH_FILE") {
        let line = format!(
            "{{\"startupMs\":{},\"renderMs\":{},\"bytes\":{}}}\n",
            startup_ms,
            metrics.render_ms.unwrap_or(-1.0),
            metrics.doc_bytes.unwrap_or(0)
        );
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(file)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
    }
    if std::env::var("MDVIBE_BENCH_EXIT").is_ok() {
        let app = window.app_handle().clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            app.exit(0);
        });
    }
}

#[tauri::command]
pub fn settings_load(state: State<'_, AppState>) -> Value {
    state.settings.load()
}

/// Opens the bundled third-party notices in a new MDVibe window.
#[tauri::command]
pub fn open_notices<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("THIRD_PARTY_NOTICES.md");
    if !path.is_file() {
        return Err("The notices file is not part of this build.".into());
    }
    instance::spawn(Some(&path), None)
}
