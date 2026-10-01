//! Minimal local diagnostic log with size-based rotation.
//!
//! Logged: app version, startup timing, errors, panics. Never logged: document
//! content. Nothing is ever sent anywhere.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MAX_LOG_BYTES: u64 = 1024 * 1024;
const KEEP_FILES: usize = 3;

struct FileLogger {
    path: PathBuf,
    level: log::LevelFilter,
    lock: Mutex<()>,
}

impl log::Log for FileLogger {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        metadata.level() <= self.level
            && (metadata.target().starts_with("mdvibe") || metadata.level() <= log::Level::Warn)
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let _g = self.lock.lock();
        rotate_if_needed(&self.path);
        let ts = timestamp();
        let line = format!(
            "{ts} [{}] pid={} {}: {}\n",
            record.level(),
            std::process::id(),
            record.target(),
            record.args()
        );
        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
        {
            let _ = f.write_all(line.as_bytes());
        }
        #[cfg(debug_assertions)]
        eprint!("{line}");
    }

    fn flush(&self) {}
}

fn rotate_if_needed(path: &Path) {
    let Ok(meta) = fs::metadata(path) else { return };
    if meta.len() < MAX_LOG_BYTES {
        return;
    }
    for i in (1..KEEP_FILES).rev() {
        let from = path.with_extension(format!("{i}.log"));
        let to = path.with_extension(format!("{}.log", i + 1));
        let _ = fs::rename(from, to);
    }
    let _ = fs::rename(path, path.with_extension("1.log"));
}

/// UTC timestamp `YYYY-MM-DDTHH:MM:SSZ` without extra dependencies.
fn timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // Civil-from-days (Howard Hinnant).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mo = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + if mo <= 2 { 1 } else { 0 };
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

pub fn init(log_dir: &Path) {
    let _ = fs::create_dir_all(log_dir);
    let logger = FileLogger {
        path: log_dir.join("mdvibe.log"),
        level: if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Info
        },
        lock: Mutex::new(()),
    };
    let level = logger.level;
    if log::set_boxed_logger(Box::new(logger)).is_ok() {
        log::set_max_level(level);
    }
}

/// Logs panics and keeps the default behaviour (unwinding / abort).
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_default();
        let msg = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "unknown panic".into());
        log::error!("panic at {location}: {msg}");
        default(info);
    }));
}

#[cfg(test)]
mod tests {
    #[test]
    fn timestamp_shape() {
        let t = super::timestamp();
        assert_eq!(t.len(), 20);
        assert!(t.starts_with("20"));
        assert!(t.ends_with('Z'));
    }
}
