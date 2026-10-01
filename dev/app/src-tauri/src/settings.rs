//! Settings persistence. The schema (defaults, validation, migrations) is owned
//! by the frontend (`src/core/settings.ts`); the backend stores the versioned
//! JSON document and reads the few values it needs before the UI exists.

use serde_json::{Map, Value};

use crate::storage::JsonStore;

/// Settings larger than this are rejected (they are a few KB in practice).
const MAX_SETTINGS_BYTES: usize = 256 * 1024;

pub struct Settings {
    store: JsonStore,
}

impl Settings {
    pub fn new(store: JsonStore) -> Self {
        Self { store }
    }

    pub fn store_path(&self) -> &std::path::Path {
        self.store.path()
    }

    /// Always returns a JSON object (empty when missing or corrupt).
    pub fn load(&self) -> Value {
        match self.store.read::<Value>() {
            Some(v @ Value::Object(_)) => v,
            _ => Value::Object(Map::new()),
        }
    }

    pub fn save(&self, value: &Value) -> Result<(), String> {
        if !value.is_object() {
            return Err("settings must be a JSON object".into());
        }
        let size = serde_json::to_vec(value)
            .map(|v| v.len())
            .unwrap_or(usize::MAX);
        if size > MAX_SETTINGS_BYTES {
            return Err("settings document is too large".into());
        }
        self.store
            .locked(|| self.store.write(value))
            .map_err(|e| e.to_string())
    }

    pub fn remember_recent(&self) -> bool {
        self.load()
            .pointer("/privacy/rememberRecent")
            .and_then(Value::as_bool)
            .unwrap_or(true)
    }

    /// "system" | "light" | "dark"
    pub fn theme(&self) -> String {
        self.load()
            .pointer("/appearance/theme")
            .and_then(Value::as_str)
            .filter(|t| matches!(*t, "light" | "dark" | "system"))
            .unwrap_or("system")
            .to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_validation() {
        let dir = tempfile::tempdir().unwrap();
        let s = Settings::new(JsonStore::new(dir.path().join("settings.json")));
        assert!(s.load().as_object().unwrap().is_empty());
        assert!(s.remember_recent());
        assert_eq!(s.theme(), "system");
        assert!(s.save(&Value::from(3)).is_err());
        s.save(&serde_json::json!({"version": 1, "appearance": {"theme": "dark"}, "privacy": {"rememberRecent": false}}))
            .unwrap();
        assert_eq!(s.theme(), "dark");
        assert!(!s.remember_recent());
        std::fs::write(s.store_path(), "[1,2").unwrap();
        assert_eq!(s.theme(), "system");
    }
}
