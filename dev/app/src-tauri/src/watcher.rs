//! File change detection.
//!
//! The *directory* of the document is watched (not the file), because editors
//! and agents commonly save atomically (write temp → rename over the original),
//! which a file-level watch would lose. Events are debounced and reduced to a
//! single "changed" / "removed" notification.
//!
//! The configuration directory is watched the same way so that settings and the
//! recent list stay in sync across independent instances.

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant};

const DEBOUNCE: Duration = Duration::from_millis(250);

pub struct DirWatcher {
    _watcher: RecommendedWatcher,
}

fn same_name(a: &Path, b: &Path) -> bool {
    match (a.file_name(), b.file_name()) {
        (Some(x), Some(y)) => {
            if cfg!(windows) {
                x.to_string_lossy().to_lowercase() == y.to_string_lossy().to_lowercase()
            } else {
                x == y
            }
        }
        _ => false,
    }
}

/// Watches `dir` and calls `on_change(name)` (debounced) for every file in
/// `names` that changed. Runs the callback on a background thread.
pub fn watch_files<F>(dir: &Path, names: Vec<PathBuf>, on_change: F) -> notify::Result<DirWatcher>
where
    F: Fn(&Path) + Send + 'static,
{
    let (tx, rx) = mpsc::channel::<PathBuf>();
    let targets = names.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, notify::EventKind::Access(_)) {
                return;
            }
            for p in &ev.paths {
                if let Some(t) = targets.iter().find(|t| same_name(t, p)) {
                    let _ = tx.send(t.clone());
                }
            }
        }
    })?;
    watcher.watch(dir, RecursiveMode::NonRecursive)?;

    std::thread::Builder::new()
        .name("mdvibe-watch".into())
        .spawn(move || {
            let mut pending: Vec<(PathBuf, Instant)> = Vec::new();
            loop {
                let timeout = pending
                    .iter()
                    .map(|(_, t)| t.saturating_duration_since(Instant::now()))
                    .min()
                    .unwrap_or(Duration::from_secs(3600));
                match rx.recv_timeout(timeout) {
                    Ok(p) => {
                        let due = Instant::now() + DEBOUNCE;
                        match pending.iter_mut().find(|(q, _)| *q == p) {
                            Some(entry) => entry.1 = due,
                            None => pending.push((p, due)),
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
                let now = Instant::now();
                let (ready, rest): (Vec<_>, Vec<_>) =
                    pending.into_iter().partition(|(_, t)| *t <= now);
                pending = rest;
                for (p, _) in ready {
                    on_change(&p);
                }
            }
        })
        .map_err(|e| notify::Error::generic(&e.to_string()))?;

    Ok(DirWatcher { _watcher: watcher })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn detects_in_place_and_atomic_saves() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("Нотатки.md");
        std::fs::write(&doc, "v1").unwrap();
        let hits = Arc::new(Mutex::new(0usize));
        let h = hits.clone();
        let _w = watch_files(dir.path(), vec![doc.clone()], move |_| {
            *h.lock().unwrap() += 1
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(150));

        // Burst of in-place writes → one debounced notification.
        for i in 0..5 {
            std::fs::write(&doc, format!("v{i}")).unwrap();
        }
        std::thread::sleep(Duration::from_millis(900));
        let after_burst = *hits.lock().unwrap();
        assert!(
            (1..=2).contains(&after_burst),
            "burst produced {after_burst}"
        );

        // Atomic save: temp file renamed over the document.
        let tmp = dir.path().join("Нотатки.md.tmp");
        std::fs::write(&tmp, "v-atomic").unwrap();
        std::fs::rename(&tmp, &doc).unwrap();
        std::thread::sleep(Duration::from_millis(900));
        assert!(
            *hits.lock().unwrap() > after_burst,
            "atomic save not detected"
        );

        // Unrelated files are ignored.
        let before = *hits.lock().unwrap();
        std::fs::write(dir.path().join("other.md"), "x").unwrap();
        std::thread::sleep(Duration::from_millis(700));
        assert_eq!(*hits.lock().unwrap(), before);
    }
}
