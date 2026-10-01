//! Link policy for activated links inside a rendered document.
//!
//! * `http`, `https`, `mailto`           → default browser / mail client
//! * local Markdown file (relative/abs)   → new MDVibe instance
//! * other local file / folder           → never executed; may be revealed in Explorer
//! * everything else (javascript:, data:, custom schemes, …) → blocked
//!
//! Anchor-only links (`#section`) never reach the backend.

use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::cli::{file_uri_to_path, normalize};
use crate::document::{display_path, is_markdown_path};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LinkTarget {
    External {
        url: String,
    },
    Markdown {
        path: String,
        fragment: Option<String>,
    },
    LocalFile {
        path: String,
    },
    Missing {
        path: String,
    },
    Blocked {
        reason: String,
    },
}

pub fn is_safe_external(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    (lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:"))
        && !url.chars().any(|c| c.is_control())
}

pub fn classify(href: &str, base_dir: Option<&Path>) -> LinkTarget {
    let href = href.trim();
    if href.is_empty() {
        return LinkTarget::Blocked {
            reason: "empty link".into(),
        };
    }
    if is_safe_external(href) {
        return LinkTarget::External {
            url: href.to_owned(),
        };
    }
    let lower = href.to_ascii_lowercase();
    let local = if lower.starts_with("file:") {
        file_uri_to_path(href)
    } else if has_scheme(href) {
        return LinkTarget::Blocked {
            reason: format!("unsupported link type: {}", scheme_of(href)),
        };
    } else {
        // Relative or absolute path, possibly percent-encoded, possibly with #fragment / ?query.
        let (path_part, _) = split_fragment(href);
        let decoded = percent_encoding::percent_decode_str(path_part)
            .decode_utf8_lossy()
            .into_owned();
        let p = PathBuf::from(decoded.replace('/', std::path::MAIN_SEPARATOR_STR));
        if p.is_absolute() {
            Some(p)
        } else {
            base_dir.map(|b| b.join(p))
        }
    };
    let Some(path) = local else {
        return LinkTarget::Blocked {
            reason: "relative link without a base document".into(),
        };
    };
    let path = normalize(&path);
    if !network_path_allowed(&path, base_dir) {
        return LinkTarget::Blocked {
            reason: "network paths on other hosts are not opened".into(),
        };
    }
    let (_, fragment) = split_fragment(href);
    if !path.exists() {
        return LinkTarget::Missing {
            path: display_path(&path),
        };
    }
    if path.is_file() && is_markdown_path(&path) {
        LinkTarget::Markdown {
            path: display_path(&path),
            fragment: fragment.map(|f| f.to_owned()),
        }
    } else {
        LinkTarget::LocalFile {
            path: display_path(&path),
        }
    }
}

/// UNC host of `\\host\share\...` (lower-case), if the path is a network path.
pub fn unc_host(p: &Path) -> Option<String> {
    let s = p.to_string_lossy().replace('/', "\\");
    let rest = s.strip_prefix(r"\\?\UNC\").or_else(|| {
        if s.starts_with(r"\\?\") || s.starts_with(r"\\.\") {
            None
        } else {
            s.strip_prefix(r"\\")
        }
    })?;
    rest.split('\\')
        .next()
        .filter(|h| !h.is_empty())
        .map(|h| h.to_ascii_lowercase())
}

/// Touching a path on another machine makes Windows authenticate over SMB,
/// which can leak the user's NTLM hash to a hostile server. Network paths are
/// only followed when the current document itself lives on that same host.
pub fn network_path_allowed(target: &Path, base_dir: Option<&Path>) -> bool {
    match unc_host(target) {
        None => true,
        Some(host) => base_dir
            .and_then(unc_host)
            .map(|b| b == host)
            .unwrap_or(false),
    }
}

/// Splits `path?query#fragment` into (path, fragment).
fn split_fragment(href: &str) -> (&str, Option<&str>) {
    let (rest, frag) = match href.find('#') {
        Some(i) => (&href[..i], Some(&href[i + 1..]).filter(|f| !f.is_empty())),
        None => (href, None),
    };
    let path = rest.find('?').map(|j| &rest[..j]).unwrap_or(rest);
    (path, frag)
}

/// `C:\x` / `C:/x` are paths, not schemes.
fn has_scheme(s: &str) -> bool {
    match s.find(':') {
        Some(i) if i > 1 => s[..i]
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '-' || c == '.'),
        _ => false,
    }
}

fn scheme_of(s: &str) -> &str {
    s.split(':').next().unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn external_schemes() {
        assert!(matches!(
            classify("https://example.com/a?b#c", None),
            LinkTarget::External { .. }
        ));
        assert!(matches!(
            classify("mailto:a@b.c", None),
            LinkTarget::External { .. }
        ));
        assert!(matches!(
            classify("HTTP://EXAMPLE.COM", None),
            LinkTarget::External { .. }
        ));
    }

    #[test]
    fn dangerous_schemes_blocked() {
        for href in [
            "javascript:alert(1)",
            "JaVaScRiPt:alert(1)",
            "vbscript:x",
            "data:text/html,<script>",
            "ms-settings:privacy",
            "search-ms:query=x",
            "\\\\evil\\share\\x.exe",
        ] {
            let t = classify(href, None);
            assert!(
                matches!(t, LinkTarget::Blocked { .. } | LinkTarget::Missing { .. }),
                "{href} -> {t:?}"
            );
        }
        assert!(!is_safe_external("https://exa\nmple.com"));
    }

    #[test]
    fn relative_markdown_and_files() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("sub dir");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(sub.join("Другой.md"), "# x").unwrap();
        std::fs::write(dir.path().join("tool.exe"), "MZ").unwrap();

        match classify(
            "sub%20dir/%D0%94%D1%80%D1%83%D0%B3%D0%BE%D0%B9.md#part",
            Some(dir.path()),
        ) {
            LinkTarget::Markdown { path, fragment } => {
                assert!(path.ends_with("Другой.md"));
                assert_eq!(fragment.as_deref(), Some("part"));
            }
            other => panic!("{other:?}"),
        }
        assert!(matches!(
            classify("sub dir/../tool.exe", Some(dir.path())),
            LinkTarget::LocalFile { .. }
        ));
        assert!(matches!(
            classify("nope.md", Some(dir.path())),
            LinkTarget::Missing { .. }
        ));
        assert!(matches!(
            classify("sub dir", Some(dir.path())),
            LinkTarget::LocalFile { .. }
        ));
    }

    #[cfg(windows)]
    #[test]
    fn unc_policy() {
        let local = Path::new(r"C:\docs");
        let share = Path::new(r"\\fileserver\team\docs");
        assert!(!network_path_allowed(
            Path::new(r"\\evil\x\a.md"),
            Some(local)
        ));
        assert!(!network_path_allowed(
            Path::new(r"\\evil\x\a.md"),
            Some(share)
        ));
        assert!(network_path_allowed(
            Path::new(r"\\FileServer\team\b.md"),
            Some(share)
        ));
        assert!(network_path_allowed(Path::new(r"C:\x.md"), None));
        assert!(network_path_allowed(Path::new(r"\\?\C:\x.md"), None));
        assert!(matches!(
            classify(r"\\evil\share\x.md", Some(local)),
            LinkTarget::Blocked { .. }
        ));
        assert!(matches!(
            classify("file://evil/share/x.md", Some(local)),
            LinkTarget::Blocked { .. }
        ));
    }

    #[cfg(windows)]
    #[test]
    fn drive_letter_is_a_path() {
        assert!(!has_scheme(r"C:\x.md"));
        assert!(!has_scheme("C:/x.md"));
        assert!(has_scheme("ms-settings:x"));
    }
}
