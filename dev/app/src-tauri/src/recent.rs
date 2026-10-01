//! Recent documents: local-only list shared by all instances.

use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::storage::JsonStore;

pub const MAX_UNPINNED: usize = 30;
pub const MAX_PINNED: usize = 30;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub opened_at: u64,
    #[serde(default)]
    pub pinned: bool,
}

#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct RecentFile {
    #[serde(default = "version")]
    pub version: u32,
    #[serde(default)]
    pub entries: Vec<RecentEntry>,
}

fn version() -> u32 {
    1
}

/// Entry plus live state for the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentView {
    pub path: String,
    pub name: String,
    pub dir: String,
    pub opened_at: u64,
    pub pinned: bool,
    pub exists: bool,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b) || a.to_lowercase() == b.to_lowercase()
    } else {
        a == b
    }
}

pub fn add(list: &mut Vec<RecentEntry>, path: &str) {
    let pinned = list.iter().any(|e| same_path(&e.path, path) && e.pinned);
    list.retain(|e| !same_path(&e.path, path));
    list.insert(
        0,
        RecentEntry {
            path: path.to_owned(),
            opened_at: now_ms(),
            pinned,
        },
    );
    trim(list);
}

fn trim(list: &mut Vec<RecentEntry>) {
    let mut pinned = 0;
    let mut unpinned = 0;
    list.retain(|e| {
        if e.pinned {
            pinned += 1;
            pinned <= MAX_PINNED
        } else {
            unpinned += 1;
            unpinned <= MAX_UNPINNED
        }
    });
}

pub struct Recent {
    store: JsonStore,
}

impl Recent {
    pub fn new(store: JsonStore) -> Self {
        Self { store }
    }

    pub fn store_path(&self) -> &Path {
        self.store.path()
    }

    fn update(&self, f: impl FnOnce(&mut Vec<RecentEntry>)) {
        self.store.locked(|| {
            let mut file = self.store.read::<RecentFile>().unwrap_or_default();
            f(&mut file.entries);
            file.version = 1;
            if let Err(e) = self.store.write(&file) {
                log::warn!("cannot save recent list: {e}");
            }
        });
    }

    pub fn add(&self, path: &str) {
        self.update(|l| add(l, path));
    }

    pub fn remove(&self, path: &str) {
        self.update(|l| l.retain(|e| !same_path(&e.path, path)));
    }

    pub fn set_pinned(&self, path: &str, pinned: bool) {
        self.update(|l| {
            for e in l.iter_mut().filter(|e| same_path(&e.path, path)) {
                e.pinned = pinned;
            }
            trim(l);
        });
    }

    pub fn clear(&self) {
        self.store.locked(|| {
            if let Err(e) = self.store.write(&RecentFile {
                version: 1,
                entries: vec![],
            }) {
                log::warn!("cannot clear recent list: {e}");
            }
        });
    }

    pub fn list(&self) -> Vec<RecentView> {
        let entries = self.store.read::<RecentFile>().unwrap_or_default().entries;
        let mut views: Vec<RecentView> = entries
            .into_iter()
            .map(|e| {
                let p = Path::new(&e.path);
                // Never touch network paths just to render the list (see links.rs).
                let exists = if crate::links::unc_host(p).is_some() {
                    true
                } else {
                    p.is_file()
                };
                RecentView {
                    name: p
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    dir: p
                        .parent()
                        .map(|d| d.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    path: e.path,
                    opened_at: e.opened_at,
                    pinned: e.pinned,
                    exists,
                }
            })
            .collect();
        // Pinned first, then most recent.
        views.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.opened_at.cmp(&a.opened_at)));
        views
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_moves_to_top_and_dedupes() {
        let mut l = vec![];
        add(&mut l, "a");
        add(&mut l, "b");
        add(&mut l, "a");
        assert_eq!(
            l.iter().map(|e| e.path.as_str()).collect::<Vec<_>>(),
            ["a", "b"]
        );
    }

    #[test]
    fn pin_survives_reopen_and_cap_applies_to_unpinned() {
        let mut l = vec![];
        add(&mut l, "keep");
        l[0].pinned = true;
        for i in 0..100 {
            add(&mut l, &format!("f{i}"));
        }
        add(&mut l, "keep");
        assert!(l.iter().any(|e| e.path == "keep" && e.pinned));
        assert_eq!(l.iter().filter(|e| !e.pinned).count(), MAX_UNPINNED);
    }

    #[test]
    fn store_operations() {
        let dir = tempfile::tempdir().unwrap();
        let doc = dir.path().join("Документ.md");
        std::fs::write(&doc, "x").unwrap();
        let r = Recent::new(JsonStore::new(dir.path().join("recent.json")));
        r.add(&doc.to_string_lossy());
        r.add("C:/definitely/missing.md");
        let v = r.list();
        assert_eq!(v.len(), 2);
        assert!(v.iter().any(|e| e.name == "Документ.md" && e.exists));
        assert!(v.iter().any(|e| e.name == "missing.md" && !e.exists));
        r.set_pinned("C:/definitely/missing.md", true);
        assert!(r.list()[0].pinned);
        r.remove("C:/definitely/missing.md");
        assert_eq!(r.list().len(), 1);
        r.clear();
        assert!(r.list().is_empty());
    }
}
