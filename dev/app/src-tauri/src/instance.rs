//! Multi-instance model: every document gets its own MDVibe process and window.
//! There is deliberately no single-instance lock or IPC between instances.

use std::path::Path;
use std::process::{Command, Stdio};

/// Environment variable through which a window tells the instance it starts
/// where it is ("x,y" in physical pixels), so the new window opens cascaded
/// instead of exactly on top of it.
pub const CASCADE_ENV: &str = "MDVIBE_CASCADE_FROM";

/// Starts a new, fully independent MDVibe process, optionally with a document.
pub fn spawn(path: Option<&Path>, origin: Option<(i32, i32)>) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let mut cmd = Command::new(exe);
    if let Some(path) = path {
        // `--` guarantees the path is never interpreted as a flag.
        cmd.arg("--").arg(path);
        if let Some(dir) = path.parent().filter(|d| d.is_dir()) {
            cmd.current_dir(dir);
        }
    }
    match origin {
        Some((x, y)) => cmd.env(CASCADE_ENV, format!("{x},{y}")),
        None => cmd.env_remove(CASCADE_ENV),
    };
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    cmd.spawn().map(|_| ()).map_err(|e| {
        log::error!("cannot start a new instance: {e}");
        e.to_string()
    })
}

/// Parses the cascade origin set by the parent window.
pub fn cascade_origin(value: Option<String>) -> Option<(i32, i32)> {
    let v = value?;
    let (x, y) = v.split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_cascade_origin() {
        assert_eq!(cascade_origin(Some("100,-20".into())), Some((100, -20)));
        assert_eq!(cascade_origin(Some("x,1".into())), None);
        assert_eq!(cascade_origin(None), None);
    }
}
