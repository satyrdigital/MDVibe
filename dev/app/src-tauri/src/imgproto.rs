//! `mdimg` protocol: serves *local images* referenced by the current document.
//!
//! The renderer rewrites `<img src="images/a.png">` to
//! `http://mdimg.localhost/<encodeURIComponent(src)>` (Windows) or
//! `mdimg://localhost/<…>` (macOS/Linux). The handler:
//!   * resolves the path relative to the current document's directory,
//!   * serves only known image types (by extension) up to a size limit,
//!   * refuses network (UNC) paths on other hosts (NTLM leak protection),
//!   * never lists directories and never serves non-image files.

use std::path::{Path, PathBuf};
use tauri::http::{header, Response, StatusCode};
use tauri::{Manager, Runtime, UriSchemeContext, UriSchemeResponder};

use crate::cli::{file_uri_to_path, normalize};
use crate::links::network_path_allowed;
use crate::AppState;

const MAX_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

pub fn mime_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" | "jfif" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        _ => return None,
    })
}

/// Maps the request path to a local file, or `None` if it must not be served.
pub fn resolve(request_path: &str, base_dir: Option<&Path>) -> Option<PathBuf> {
    let encoded = request_path.trim_start_matches('/');
    let src = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .ok()?;
    let src = src.trim();
    if src.is_empty() {
        return None;
    }
    let path = if src.to_ascii_lowercase().starts_with("file:") {
        file_uri_to_path(src)?
    } else {
        let no_query = src.split(['?', '#']).next().unwrap_or("");
        let decoded = percent_encoding::percent_decode_str(no_query).decode_utf8_lossy();
        let p = PathBuf::from(decoded.replace('/', std::path::MAIN_SEPARATOR_STR));
        if p.is_absolute() {
            p
        } else {
            base_dir?.join(p)
        }
    };
    let path = normalize(&path);
    if !network_path_allowed(&path, base_dir) {
        return None;
    }
    mime_for(&path)?;
    Some(path)
}

fn respond_status(responder: UriSchemeResponder, status: StatusCode) {
    let resp = Response::builder()
        .status(status)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Vec::new())
        .unwrap_or_default();
    responder.respond(resp);
}

pub fn handle<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let base_dir = ctx
        .app_handle()
        .try_state::<AppState>()
        .and_then(|s| s.doc_dir());
    let path_str = request.uri().path().to_owned();
    std::thread::spawn(move || {
        let Some(path) = resolve(&path_str, base_dir.as_deref()) else {
            return respond_status(responder, StatusCode::FORBIDDEN);
        };
        let meta = match std::fs::metadata(&path) {
            Ok(m) if m.is_file() => m,
            _ => return respond_status(responder, StatusCode::NOT_FOUND),
        };
        if meta.len() > MAX_IMAGE_BYTES {
            return respond_status(responder, StatusCode::PAYLOAD_TOO_LARGE);
        }
        match std::fs::read(&path) {
            Ok(bytes) => {
                let resp = Response::builder()
                    .status(StatusCode::OK)
                    .header(
                        header::CONTENT_TYPE,
                        mime_for(&path).unwrap_or("application/octet-stream"),
                    )
                    .header(header::CACHE_CONTROL, "no-cache")
                    .header("X-Content-Type-Options", "nosniff")
                    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                    .header(
                        header::CONTENT_SECURITY_POLICY,
                        "default-src 'none'; style-src 'unsafe-inline'",
                    )
                    .body(bytes)
                    .unwrap_or_default();
                responder.respond(resp);
            }
            Err(_) => respond_status(responder, StatusCode::NOT_FOUND),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn enc(s: &str) -> String {
        format!(
            "/{}",
            percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC)
        )
    }

    #[test]
    fn resolves_relative_images_only() {
        let base = if cfg!(windows) {
            PathBuf::from(r"C:\docs\guide")
        } else {
            PathBuf::from("/docs/guide")
        };
        let p = resolve(&enc("../img/Схема%201.png?raw=true"), Some(&base)).unwrap();
        assert!(p.ends_with(Path::new("img").join("Схема 1.png")), "{p:?}");
        assert!(resolve(&enc("notes.md"), Some(&base)).is_none());
        assert!(resolve(&enc("../../secrets.txt"), Some(&base)).is_none());
        assert!(resolve(&enc("a.exe"), Some(&base)).is_none());
        assert!(resolve(&enc("a.png"), None).is_none());
        assert!(resolve("/", Some(&base)).is_none());
    }

    #[cfg(windows)]
    #[test]
    fn refuses_foreign_unc() {
        let base = PathBuf::from(r"C:\docs");
        assert!(resolve(&enc(r"\\evil\share\x.png"), Some(&base)).is_none());
        assert!(resolve(&enc("file://evil/share/x.png"), Some(&base)).is_none());
        assert!(resolve(&enc("file:///C:/img/x.png"), Some(&base)).is_some());
    }
}
