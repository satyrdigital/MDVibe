//! MDVibe application shell.
//!
//! One process = one window = one document.

mod cli;
mod commands;
mod document;
mod imgproto;
mod instance;
mod links;
mod logging;
mod recent;
mod settings;
mod storage;
mod watcher;
#[cfg(windows)]
mod win;
mod window_state;

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use tauri::webview::NewWindowResponse;
use tauri::window::Color;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use recent::Recent;
use settings::Settings;
use storage::JsonStore;
use watcher::DirWatcher;

pub struct AppState {
    pub started: Instant,
    launch_file: Mutex<Option<PathBuf>>,
    doc: Mutex<Option<PathBuf>>,
    doc_watcher: Mutex<Option<DirWatcher>>,
    _config_watcher: Mutex<Option<DirWatcher>>,
    pub settings: Settings,
    pub recent: Recent,
    pub window_store: JsonStore,
    pub log_dir: PathBuf,
}

impl AppState {
    pub fn doc_path(&self) -> Option<PathBuf> {
        self.doc.lock().ok().and_then(|g| g.clone())
    }

    pub fn doc_dir(&self) -> Option<PathBuf> {
        self.doc_path()
            .and_then(|p| p.parent().map(Path::to_path_buf))
    }

    pub fn set_doc(&self, p: Option<PathBuf>) {
        if let Ok(mut g) = self.doc.lock() {
            *g = p;
        }
    }

    pub fn set_doc_watcher(&self, w: Option<DirWatcher>) {
        if let Ok(mut g) = self.doc_watcher.lock() {
            *g = w;
        }
    }

    pub fn take_launch_file(&self) -> Option<PathBuf> {
        self.launch_file.lock().ok().and_then(|mut g| g.take())
    }
}

/// Only the bundled UI may be displayed; any other navigation is cancelled.
fn is_app_url(url: &tauri::Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "http" | "https" => {
            let host = url.host_str().unwrap_or("");
            host == "tauri.localhost" || (cfg!(debug_assertions) && host == "localhost")
        }
        _ => false,
    }
}

fn background_for(theme: &str) -> Color {
    let dark = match theme {
        "dark" => true,
        "light" => false,
        _ => system_prefers_dark(),
    };
    if dark {
        Color(0x16, 0x18, 0x1d, 0xff)
    } else {
        Color(0xff, 0xff, 0xff, 0xff)
    }
}

#[cfg(windows)]
fn system_prefers_dark() -> bool {
    // HKCU\...\Themes\Personalize\AppsUseLightTheme = 0 → dark.
    let key = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    read_hkcu_dword(key, "AppsUseLightTheme")
        .map(|v| v == 0)
        .unwrap_or(false)
}

#[cfg(windows)]
fn read_hkcu_dword(key: &str, value: &str) -> Option<u32> {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_DWORD};
    let mut data: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    let r = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            &HSTRING::from(key),
            &HSTRING::from(value),
            RRF_RT_REG_DWORD,
            None,
            Some(&mut data as *mut u32 as *mut _),
            Some(&mut size),
        )
    };
    r.is_ok().then_some(data)
}

#[cfg(not(windows))]
fn system_prefers_dark() -> bool {
    false
}

pub fn run() {
    let started = Instant::now();
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let launch = cli::parse(std::env::args_os().skip(1), &cwd);

    // Extra documents passed on the command line each get their own instance.
    for extra in &launch.extra {
        let _ = instance::spawn(Some(extra), None);
    }

    #[cfg(windows)]
    if win::webview2_version().is_none() {
        win::error_box(
            "MDVibe",
            "MDVibe needs the Microsoft Edge WebView2 Runtime, which is not installed on this PC.\n\n\
             Install it from https://go.microsoft.com/fwlink/p/?LinkId=2124703 (or use the MDVibe installer, \
             which installs it automatically), then start MDVibe again.",
        );
        return;
    }

    let launch_file = launch.file.clone();
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("mdimg", imgproto::handle)
        .setup(move |app| {
            let config_dir = app.path().app_config_dir()?;
            let local_dir = app.path().app_local_data_dir()?;
            let log_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| local_dir.join("logs"));
            logging::init(&log_dir);
            logging::install_panic_hook();
            log::info!(
                "MDVibe {} starting ({} {})",
                app.package_info().version,
                std::env::consts::OS,
                std::env::consts::ARCH
            );

            let settings = Settings::new(JsonStore::new(config_dir.join("settings.json")));
            let theme = settings.theme();
            let state = AppState {
                started,
                launch_file: Mutex::new(launch_file),
                doc: Mutex::new(None),
                doc_watcher: Mutex::new(None),
                _config_watcher: Mutex::new(None),
                settings,
                recent: Recent::new(JsonStore::new(config_dir.join("recent.json"))),
                window_store: JsonStore::new(local_dir.join("window-state.json")),
                log_dir,
            };
            app.manage(state);

            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("MDVibe")
                    .inner_size(1100.0, 800.0)
                    .min_inner_size(480.0, 360.0)
                    .visible(false)
                    .background_color(background_for(&theme))
                    .theme(match theme.as_str() {
                        "dark" => Some(tauri::Theme::Dark),
                        "light" => Some(tauri::Theme::Light),
                        _ => None,
                    })
                    .zoom_hotkeys_enabled(false)
                    .on_navigation(is_app_url)
                    .on_new_window(|_, _| NewWindowResponse::Deny)
                    .on_download(|_, _| false)
                    .build()?;

            #[cfg(windows)]
            win::harden(&window);

            {
                let state = app.state::<AppState>();
                let cascade = instance::cascade_origin(std::env::var(instance::CASCADE_ENV).ok());
                window_state::apply(&window, &state.window_store, cascade);
            }

            // Safety net: show the window even if the renderer never reports ready.
            let w = window.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(4));
                if !w.is_visible().unwrap_or(true) {
                    log::warn!("renderer did not report ready; showing window");
                    let _ = w.show();
                }
            });

            // Keep settings and the recent list in sync across instances.
            let names = vec![
                config_dir.join("settings.json"),
                config_dir.join("recent.json"),
            ];
            let _ = std::fs::create_dir_all(&config_dir);
            let w = window.clone();
            match watcher::watch_files(&config_dir, names, move |p| {
                let event = if p.file_name().map(|n| n == "settings.json").unwrap_or(false) {
                    "settings-changed"
                } else {
                    "recent-changed"
                };
                let _ = w.emit_to(w.label(), event, ());
            }) {
                Ok(cw) => {
                    if let Ok(mut g) = app.state::<AppState>()._config_watcher.lock() {
                        *g = Some(cw);
                    }
                }
                Err(e) => log::warn!("config watching unavailable: {e}"),
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                if let (Some(ww), Some(state)) = (
                    window.app_handle().get_webview_window(window.label()),
                    window.app_handle().try_state::<AppState>(),
                ) {
                    window_state::save(&ww, &state.window_store);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::startup_info,
            commands::open_document,
            commands::reload_document,
            commands::pick_markdown_file,
            commands::open_in_new_window,
            commands::activate_link,
            commands::open_external,
            commands::reveal_in_folder,
            commands::settings_save,
            commands::recent_list,
            commands::recent_remove,
            commands::recent_set_pinned,
            commands::recent_clear,
            commands::export_pdf,
            commands::log_message,
            commands::open_log_folder,
            commands::app_ready,
            commands::settings_load,
            commands::open_notices,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        log::error!("fatal: {e}");
        #[cfg(windows)]
        win::error_box("MDVibe", &format!("MDVibe could not start.\n\n{e}"));
    }
}
