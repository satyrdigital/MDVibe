//! Last window geometry, shared as a *default* for new instances.
//! Each instance stays independent; the last closed window wins.

use serde::{Deserialize, Serialize};
use tauri::{PhysicalPosition, PhysicalSize, Runtime, WebviewWindow};

use crate::storage::JsonStore;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

const MIN_VISIBLE_W: i32 = 160;
const MIN_VISIBLE_H: i32 = 100;

/// True if a usable part of the window (incl. the title bar area) is on a monitor.
pub fn is_visible(s: &WindowState, monitors: &[Rect]) -> bool {
    if s.width < 200 || s.height < 150 {
        return false;
    }
    monitors.iter().any(|m| {
        let left = s.x.max(m.x);
        let right = (s.x + s.width as i32).min(m.x + m.w);
        let top = s.y.max(m.y);
        let bottom = (s.y + s.height as i32).min(m.y + m.h);
        right - left >= MIN_VISIBLE_W
            && bottom - top >= MIN_VISIBLE_H
            && s.y >= m.y - 8
            && s.y < m.y + m.h - 40
    })
}

/// Offset between a window and the instance it opens.
const CASCADE_STEP: i32 = 32;

pub fn apply<R: Runtime>(
    window: &WebviewWindow<R>,
    store: &JsonStore,
    cascade_from: Option<(i32, i32)>,
) {
    let Some(mut state) = store.read::<WindowState>() else {
        let _ = window.center();
        return;
    };
    if let Some((x, y)) = cascade_from {
        state.x = x + CASCADE_STEP;
        state.y = y + CASCADE_STEP;
        state.maximized = false;
    }
    let monitors: Vec<Rect> = window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            let wa = m.work_area();
            Rect {
                x: wa.position.x,
                y: wa.position.y,
                w: wa.size.width as i32,
                h: wa.size.height as i32,
            }
        })
        .collect();
    if is_visible(&state, &monitors) {
        let _ = window.set_size(PhysicalSize::new(state.width, state.height));
        let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
    } else {
        let _ = window.center();
    }
    if state.maximized {
        let _ = window.maximize();
    }
}

pub fn save<R: Runtime>(window: &WebviewWindow<R>, store: &JsonStore) {
    if window.is_fullscreen().unwrap_or(false) || window.is_minimized().unwrap_or(false) {
        return;
    }
    let maximized = window.is_maximized().unwrap_or(false);
    store.locked(|| {
        let mut state = store.read::<WindowState>().unwrap_or(WindowState {
            x: 100,
            y: 100,
            width: 1100,
            height: 800,
            maximized: false,
        });
        if !maximized {
            if let (Ok(pos), Ok(size)) = (window.outer_position(), window.inner_size()) {
                state.x = pos.x;
                state.y = pos.y;
                state.width = size.width;
                state.height = size.height;
            }
        }
        state.maximized = maximized;
        let _ = store.write(&state);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = Rect {
        x: 0,
        y: 0,
        w: 1920,
        h: 1040,
    };

    fn st(x: i32, y: i32) -> WindowState {
        WindowState {
            x,
            y,
            width: 1000,
            height: 700,
            maximized: false,
        }
    }

    #[test]
    fn visibility_rules() {
        assert!(is_visible(&st(100, 100), &[SCREEN]));
        // Second monitor was unplugged.
        assert!(!is_visible(&st(2500, 100), &[SCREEN]));
        // Title bar above the screen.
        assert!(!is_visible(&st(100, -400), &[SCREEN]));
        // Mostly off the right edge.
        assert!(!is_visible(&st(1850, 100), &[SCREEN]));
        // Monitor to the left with negative coordinates.
        let left = Rect {
            x: -1600,
            y: 0,
            w: 1600,
            h: 860,
        };
        assert!(is_visible(&st(-1400, 50), &[SCREEN, left]));
        // Degenerate size.
        let mut tiny = st(10, 10);
        tiny.width = 20;
        assert!(!is_visible(&tiny, &[SCREEN]));
    }
}
