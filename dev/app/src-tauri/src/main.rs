// Release builds are GUI-subsystem executables: no console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mdvibe_lib::run();
}
