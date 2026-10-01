fn main() {
    // App manifest: only the commands listed here can be granted to the
    // renderer, and only through capabilities/default.json.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "startup_info",
            "open_document",
            "reload_document",
            "pick_markdown_file",
            "open_in_new_window",
            "activate_link",
            "open_external",
            "reveal_in_folder",
            "settings_save",
            "recent_list",
            "recent_remove",
            "recent_set_pinned",
            "recent_clear",
            "export_pdf",
            "log_message",
            "open_log_folder",
            "app_ready",
            "settings_load",
            "open_notices",
        ]),
    ))
    .expect("failed to run tauri-build");
}
