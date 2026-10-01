//! Command-line parsing.
//!
//! Supported forms:
//!   MDVibe.exe
//!   MDVibe.exe "C:\docs\README.md"
//!   MDVibe.exe "file:///C:/docs/README.md"
//!   MDVibe.exe a.md b.md            (first opens here, the rest in new instances)
//!
//! Unknown `--flags` are ignored so that shell integrations which append
//! switches never break startup.

use std::ffi::OsString;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct LaunchArgs {
    /// Document to open in this instance.
    pub file: Option<PathBuf>,
    /// Further documents: each one gets its own instance.
    pub extra: Vec<PathBuf>,
}

pub fn parse<I>(args: I, cwd: &Path) -> LaunchArgs
where
    I: IntoIterator<Item = OsString>,
{
    let mut files: Vec<PathBuf> = Vec::new();
    let mut only_paths = false;
    for raw in args {
        let s = raw.to_string_lossy().into_owned();
        if !only_paths {
            if s == "--" {
                only_paths = true;
                continue;
            }
            if s.starts_with("--") {
                continue;
            }
        }
        let trimmed = s.trim().trim_matches('"');
        if trimmed.is_empty() {
            continue;
        }
        let path = if let Some(p) = file_uri_to_path(trimmed) {
            p
        } else if trimmed.len() == s.len() {
            // Untouched argument: keep the original OS string (lossless on Windows).
            PathBuf::from(raw)
        } else {
            PathBuf::from(trimmed)
        };
        let abs = if path.is_absolute() {
            path
        } else {
            cwd.join(path)
        };
        files.push(normalize(&abs));
    }
    let mut it = files.into_iter();
    LaunchArgs {
        file: it.next(),
        extra: it.collect(),
    }
}

/// Lexically normalize `.` and `..` without touching the filesystem
/// (the file may not exist; a clean path is still useful for the error message).
pub fn normalize(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                let is_root = matches!(
                    out.components().next_back(),
                    None | Some(Component::RootDir) | Some(Component::Prefix(_))
                );
                if !is_root {
                    out.pop();
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Converts `file:///C:/a%20b/x.md` (or `file:///home/x.md`) to a path.
pub fn file_uri_to_path(s: &str) -> Option<PathBuf> {
    let rest = s
        .strip_prefix("file://")
        .or_else(|| s.strip_prefix("FILE://"))?;
    let decoded = percent_encoding::percent_decode_str(rest)
        .decode_utf8()
        .ok()?
        .into_owned();
    // file:///C:/x  -> "/C:/x" ; file://server/share -> "server/share" (UNC)
    let p = if cfg!(windows) {
        let d = decoded.trim_start_matches('/');
        if d.len() >= 2 && d.as_bytes()[1] == b':' {
            d.replace('/', "\\")
        } else if decoded.starts_with('/') {
            decoded.replace('/', "\\")
        } else {
            format!("\\\\{}", d.replace('/', "\\"))
        }
    } else {
        decoded
    };
    Some(PathBuf::from(p))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn os(v: &[&str]) -> Vec<OsString> {
        v.iter().map(OsString::from).collect()
    }

    fn cwd() -> PathBuf {
        if cfg!(windows) {
            PathBuf::from(r"C:\work")
        } else {
            PathBuf::from("/work")
        }
    }

    #[test]
    fn no_args_means_welcome() {
        let a = parse(os(&[]), &cwd());
        assert_eq!(a, LaunchArgs::default());
    }

    #[test]
    fn relative_path_resolves_against_cwd() {
        let a = parse(os(&["docs/README.md"]), &cwd());
        assert_eq!(a.file.unwrap(), cwd().join("docs").join("README.md"));
    }

    #[test]
    fn flags_are_ignored_and_extra_files_collected() {
        let a = parse(os(&["--foo", "a.md", "b.md", "--bar", "c.md"]), &cwd());
        assert_eq!(a.file.unwrap(), cwd().join("a.md"));
        assert_eq!(a.extra.len(), 2);
    }

    #[test]
    fn double_dash_allows_dash_prefixed_names() {
        let a = parse(os(&["--", "--weird.md"]), &cwd());
        assert_eq!(a.file.unwrap(), cwd().join("--weird.md"));
    }

    #[test]
    fn unicode_and_spaces_survive() {
        let a = parse(os(&["папка с пробелами/Документ 📄.md"]), &cwd());
        let f = a.file.unwrap();
        assert!(f.to_string_lossy().contains("папка с пробелами"));
        assert!(f.to_string_lossy().ends_with("Документ 📄.md"));
    }

    #[test]
    fn dotdot_is_normalized() {
        let a = parse(os(&["x/../y/./z.md"]), &cwd());
        assert_eq!(a.file.unwrap(), cwd().join("y").join("z.md"));
    }

    #[cfg(windows)]
    #[test]
    fn file_uri_is_decoded() {
        let a = parse(os(&["file:///C:/My%20Docs/%D0%A4.md"]), &cwd());
        assert_eq!(a.file.unwrap(), PathBuf::from(r"C:\My Docs\Ф.md"));
    }

    #[cfg(windows)]
    #[test]
    fn absolute_windows_path_kept() {
        let a = parse(os(&[r"D:\folder with spaces\README.md"]), &cwd());
        assert_eq!(
            a.file.unwrap(),
            PathBuf::from(r"D:\folder with spaces\README.md")
        );
    }
}
