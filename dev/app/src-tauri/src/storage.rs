//! Small JSON files shared by all running MDVibe instances
//! (settings, recent documents, window state).
//!
//! * Writes are atomic: temp file + rename, so a crash never leaves half a file.
//! * Read-modify-write cycles are serialized across processes with an OS file lock.
//! * A corrupt file is moved aside (`*.corrupt-<ts>.json`) and defaults are used:
//!   a broken config must never prevent the app from starting.

use serde::{de::DeserializeOwned, Serialize};
use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};

pub struct JsonStore {
    path: PathBuf,
}

impl JsonStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn lock_path(&self) -> PathBuf {
        self.path.with_extension("lock")
    }

    /// Holds an exclusive inter-process lock for the duration of `f`.
    pub fn locked<T>(&self, f: impl FnOnce() -> T) -> T {
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        let guard = OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(self.lock_path())
            .ok();
        if let Some(f) = &guard {
            let _ = f.lock();
        }
        let out = f();
        if let Some(f) = &guard {
            let _ = f.unlock();
        }
        out
    }

    /// Reads and parses the file. Missing → `None`. Corrupt → moved aside, `None`.
    pub fn read<T: DeserializeOwned>(&self) -> Option<T> {
        let bytes = match read_retry(&self.path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return None,
            Err(e) => {
                log::warn!("cannot read {}: {e}", self.path.display());
                return None;
            }
        };
        match serde_json::from_slice::<T>(&bytes) {
            Ok(v) => Some(v),
            Err(e) => {
                log::warn!("corrupt {}: {e}; moving aside", self.path.display());
                self.quarantine();
                None
            }
        }
    }

    fn quarantine(&self) {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let stem = self
            .path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("store");
        let aside = self
            .path
            .with_file_name(format!("{stem}.corrupt-{ts}.json"));
        let _ = fs::rename(&self.path, aside);
    }

    pub fn write<T: Serialize>(&self, value: &T) -> std::io::Result<()> {
        let dir = self.path.parent().unwrap_or(Path::new("."));
        fs::create_dir_all(dir)?;
        let data = serde_json::to_vec_pretty(value).map_err(std::io::Error::other)?;
        let tmp = self
            .path
            .with_extension(format!("tmp-{}", std::process::id()));
        {
            let mut f = File::create(&tmp)?;
            std::io::Write::write_all(&mut f, &data)?;
            f.sync_all()?;
        }
        let mut last = None;
        for attempt in 0..5u64 {
            match fs::rename(&tmp, &self.path) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last = Some(e);
                    std::thread::sleep(std::time::Duration::from_millis(20 * (attempt + 1)));
                }
            }
        }
        let _ = fs::remove_file(&tmp);
        Err(last.unwrap_or_else(|| std::io::Error::other("rename failed")))
    }
}

fn read_retry(path: &Path) -> std::io::Result<Vec<u8>> {
    let mut attempt = 0u64;
    loop {
        match fs::read(path) {
            Err(e) if attempt < 4 && matches!(e.raw_os_error(), Some(5) | Some(32) | Some(33)) => {
                attempt += 1;
                std::thread::sleep(std::time::Duration::from_millis(15 * attempt));
            }
            other => return other,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Serialize, Deserialize, PartialEq, Debug)]
    struct S {
        a: u32,
    }

    #[test]
    fn roundtrip_and_corruption() {
        let dir = tempfile::tempdir().unwrap();
        let store = JsonStore::new(dir.path().join("cfg").join("s.json"));
        assert!(store.read::<S>().is_none());
        store.locked(|| store.write(&S { a: 7 })).unwrap();
        assert_eq!(store.read::<S>(), Some(S { a: 7 }));

        fs::write(store.path(), b"{ not json").unwrap();
        assert!(store.read::<S>().is_none());
        assert!(!store.path().exists(), "corrupt file must be moved aside");
        let quarantined = fs::read_dir(store.path().parent().unwrap())
            .unwrap()
            .filter_map(|e| e.ok())
            .any(|e| e.file_name().to_string_lossy().contains(".corrupt-"));
        assert!(quarantined);
    }

    #[test]
    fn concurrent_writers_do_not_lose_updates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("n.json");
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let path = path.clone();
                std::thread::spawn(move || {
                    let store = JsonStore::new(path);
                    for _ in 0..10 {
                        store.locked(|| {
                            let cur = store.read::<S>().map(|s| s.a).unwrap_or(0);
                            store.write(&S { a: cur + 1 }).unwrap();
                        });
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        assert_eq!(JsonStore::new(path).read::<S>().unwrap().a, 80);
    }
}
