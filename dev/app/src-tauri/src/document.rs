//! Loading Markdown documents from disk: size limits, encoding detection,
//! and user-facing error classification. The content is never logged.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Hard limit: larger files are refused (the renderer is not virtualized).
pub const MAX_BYTES: u64 = 64 * 1024 * 1024;

/// Extensions treated as Markdown documents (lower-case, without dot).
pub const MARKDOWN_EXTENSIONS: &[&str] = &[
    "md", "markdown", "mdown", "mkd", "mkdn", "mdwn", "mdtxt", "txt",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedDocument {
    pub path: String,
    pub name: String,
    pub dir: String,
    pub text: String,
    pub encoding: String,
    pub bytes: u64,
    pub modified_ms: u64,
    pub line_ending: &'static str,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    NotFound,
    AccessDenied,
    Locked,
    IsDirectory,
    TooLarge,
    NotText,
    Other,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentError {
    pub kind: ErrorKind,
    pub path: String,
    /// Technical detail for the expandable "Details" section.
    pub detail: String,
}

impl DocumentError {
    fn new(kind: ErrorKind, path: &Path, detail: impl Into<String>) -> Self {
        Self {
            kind,
            path: path.to_string_lossy().into_owned(),
            detail: detail.into(),
        }
    }

    pub fn from_io(path: &Path, e: &std::io::Error) -> Self {
        use std::io::ErrorKind as K;
        let kind = match e.kind() {
            K::NotFound => ErrorKind::NotFound,
            K::PermissionDenied => ErrorKind::AccessDenied,
            K::IsADirectory => ErrorKind::IsDirectory,
            _ => match e.raw_os_error() {
                // ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
                Some(32) | Some(33) if cfg!(windows) => ErrorKind::Locked,
                _ => ErrorKind::Other,
            },
        };
        Self::new(kind, path, e.to_string())
    }
}

pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| MARKDOWN_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn load(path: &Path) -> Result<LoadedDocument, DocumentError> {
    let meta = std::fs::metadata(path).map_err(|e| DocumentError::from_io(path, &e))?;
    if meta.is_dir() {
        return Err(DocumentError::new(
            ErrorKind::IsDirectory,
            path,
            "path is a directory",
        ));
    }
    if meta.len() > MAX_BYTES {
        return Err(DocumentError::new(
            ErrorKind::TooLarge,
            path,
            format!("{} bytes (limit {} bytes)", meta.len(), MAX_BYTES),
        ));
    }
    let bytes = read_with_retry(path).map_err(|e| DocumentError::from_io(path, &e))?;
    let (text, encoding) = decode(&bytes).ok_or_else(|| {
        DocumentError::new(
            ErrorKind::NotText,
            path,
            "binary content (NUL bytes) detected",
        )
    })?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let line_ending = if text.contains("\r\n") { "CRLF" } else { "LF" };
    Ok(LoadedDocument {
        path: display_path(path),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        dir: path.parent().map(display_path).unwrap_or_default(),
        text,
        encoding,
        bytes: bytes.len() as u64,
        modified_ms,
        line_ending,
    })
}

/// Editors and agents often rewrite files in place; a short retry rides out
/// transient sharing violations instead of showing an error.
fn read_with_retry(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut last = None;
    for attempt in 0..4 {
        match std::fs::read(path) {
            Ok(b) => return Ok(b),
            Err(e) => {
                let transient = matches!(e.raw_os_error(), Some(32) | Some(33));
                if !transient || attempt == 3 {
                    return Err(e);
                }
                last = Some(e);
                std::thread::sleep(std::time::Duration::from_millis(60 * (attempt + 1)));
            }
        }
    }
    Err(last.unwrap_or_else(|| std::io::Error::other("read failed")))
}

/// Decodes bytes to text. Order: BOM (UTF-8/UTF-16LE/BE) → valid UTF-8 →
/// statistical detection for legacy single-byte encodings (e.g. windows-1251).
/// Returns `None` for binary data.
pub fn decode(bytes: &[u8]) -> Option<(String, String)> {
    if let Some((enc, bom_len)) = encoding_rs::Encoding::for_bom(bytes) {
        let (text, _) = enc.decode_without_bom_handling(&bytes[bom_len..]);
        return Some((text.into_owned(), format!("{} (BOM)", enc.name())));
    }
    let probe = &bytes[..bytes.len().min(8192)];
    if probe.contains(&0) {
        return None;
    }
    if let Ok(s) = std::str::from_utf8(bytes) {
        return Some((s.to_owned(), "UTF-8".to_owned()));
    }
    let mut det = chardetng::EncodingDetector::new(chardetng::Iso2022JpDetection::Deny);
    det.feed(bytes, true);
    let enc = det.guess(None, chardetng::Utf8Detection::Allow);
    let (text, _, _) = enc.decode(bytes);
    Some((text.into_owned(), enc.name().to_owned()))
}

/// Path without the `\\?\` verbatim prefix.
pub fn display_path(p: &Path) -> String {
    dunce::simplified(p).to_string_lossy().into_owned()
}

/// Canonical absolute path (no verbatim prefix) if the file exists.
pub fn canonical(p: &Path) -> Option<PathBuf> {
    dunce::canonicalize(p).ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn utf8_plain() {
        let (t, e) = decode("Привіт, світ — hello 👋".as_bytes()).unwrap();
        assert_eq!(t, "Привіт, світ — hello 👋");
        assert_eq!(e, "UTF-8");
    }

    #[test]
    fn utf8_bom_is_stripped() {
        let mut b = vec![0xEF, 0xBB, 0xBF];
        b.extend_from_slice("# Заголовок".as_bytes());
        let (t, e) = decode(&b).unwrap();
        assert_eq!(t, "# Заголовок");
        assert!(e.starts_with("UTF-8"));
    }

    #[test]
    fn utf16le_bom() {
        let mut b = vec![0xFF, 0xFE];
        for u in "# Тест".encode_utf16() {
            b.extend_from_slice(&u.to_le_bytes());
        }
        let (t, e) = decode(&b).unwrap();
        assert_eq!(t, "# Тест");
        assert!(e.starts_with("UTF-16LE"));
    }

    #[test]
    fn utf16be_bom() {
        let mut b = vec![0xFE, 0xFF];
        for u in "ok ✓".encode_utf16() {
            b.extend_from_slice(&u.to_be_bytes());
        }
        assert_eq!(decode(&b).unwrap().0, "ok ✓");
    }

    #[test]
    fn legacy_cp1251_is_detected() {
        let (bytes, _, _) = encoding_rs::WINDOWS_1251
            .encode("Это документ на русском языке, написанный в старой кодировке Windows.");
        let (t, e) = decode(&bytes).unwrap();
        assert!(t.starts_with("Это документ"), "decoded as {e}: {t}");
    }

    #[test]
    fn binary_is_rejected() {
        assert!(decode(&[0x89, b'P', b'N', b'G', 0, 0, 0, 13]).is_none());
    }

    #[test]
    fn markdown_extensions() {
        assert!(is_markdown_path(Path::new("a/README.MD")));
        assert!(is_markdown_path(Path::new("x.markdown")));
        assert!(!is_markdown_path(Path::new("x.exe")));
        assert!(!is_markdown_path(Path::new("x")));
    }

    #[test]
    fn load_reports_metadata_and_errors() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Документ с пробелами.md");
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(b"# Title\r\n\r\nBody\r\n").unwrap();
        drop(f);
        let d = load(&p).unwrap();
        assert_eq!(d.name, "Документ с пробелами.md");
        assert_eq!(d.line_ending, "CRLF");
        assert_eq!(d.bytes, 17);

        let missing = load(&dir.path().join("nope.md")).unwrap_err();
        assert_eq!(missing.kind, ErrorKind::NotFound);
        let isdir = load(dir.path()).unwrap_err();
        assert_eq!(isdir.kind, ErrorKind::IsDirectory);
    }
}
