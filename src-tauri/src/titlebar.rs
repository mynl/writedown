//! Brand the Windows title bar (issue E.02).
//!
//! The default caption is the same grey as every other window on the desktop, which makes
//! Writedown hard to pick out of a crowded taskbar/Alt-Tab. Windows 11 (build 22000+) lets
//! an app colour its own caption through DWM, so the bar takes the orange from the logo's
//! "down" and the title text takes the navy from "write".
//!
//! No new dependency: `dwmapi.dll` is declared directly, the same way `AttachConsole` is in
//! `lib.rs`. Tauri's `hwnd()` returns the `windows` crate's `HWND`, which we deliberately
//! never name — reading its public `.0` field keeps that type out of our Cargo.toml.
//!
//! On Windows 10 the attributes do not exist and `DwmSetWindowAttribute` returns an error,
//! which is ignored: an un-branded title bar is not a failure worth reporting.

/// Logo orange (the "down" in the wordmark), sampled from `assets/writedown-logo.png`.
pub const BRAND_ORANGE: (u8, u8, u8) = (0xDD, 0x95, 0x36);
/// Logo navy (the "write"), used for the caption text — dark on the light orange.
pub const BRAND_NAVY: (u8, u8, u8) = (0x15, 0x38, 0x5D);

const DWMWA_CAPTION_COLOR: u32 = 35;
const DWMWA_TEXT_COLOR: u32 = 36;

#[cfg(windows)]
#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(
        hwnd: isize,
        attribute: u32,
        pv_attribute: *const std::ffi::c_void,
        cb_attribute: u32,
    ) -> i32;
}

/// `#RRGGBB` (or `RRGGBB`) → (r, g, b). Anything else is None, so a typo in config falls
/// back to the brand colour rather than painting the caption black.
pub fn parse_hex(s: &str) -> Option<(u8, u8, u8)> {
    let h = s.trim().trim_start_matches('#');
    if h.len() != 6 || !h.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    Some((
        u8::from_str_radix(&h[0..2], 16).ok()?,
        u8::from_str_radix(&h[2..4], 16).ok()?,
        u8::from_str_radix(&h[4..6], 16).ok()?,
    ))
}

/// COLORREF is 0x00BBGGRR — **not** RGB. Getting this backwards paints a plausible-looking
/// but wrong colour (our orange would come out sky blue), so it has its own test.
pub fn colorref(rgb: (u8, u8, u8)) -> u32 {
    let (r, g, b) = rgb;
    (b as u32) << 16 | (g as u32) << 8 | r as u32
}

/// `[window]` in config.toml: `titlebar_color` / `titlebar_text_color`, `#RRGGBB`. Setting
/// either to `"none"` leaves that part of the caption to Windows.
fn configured(app: &tauri::AppHandle) -> (Option<(u8, u8, u8)>, Option<(u8, u8, u8)>) {
    let mut caption = Some(BRAND_ORANGE);
    let mut text = Some(BRAND_NAVY);
    let Ok(dir) = crate::config::writedown_dir(app) else { return (caption, text) };
    let txt = std::fs::read_to_string(dir.join("config.toml")).unwrap_or_default();
    let Ok(val) = txt.parse::<toml::Value>() else { return (caption, text) };
    let Some(w) = val.get("window") else { return (caption, text) };
    let read = |key: &str, slot: &mut Option<(u8, u8, u8)>| {
        if let Some(s) = w.get(key).and_then(|v| v.as_str()) {
            if s.trim().eq_ignore_ascii_case("none") {
                *slot = None;
            } else if let Some(c) = parse_hex(s) {
                *slot = Some(c);
            }
            // An unparseable value keeps the brand default — see parse_hex.
        }
    };
    read("titlebar_color", &mut caption);
    read("titlebar_text_color", &mut text);
    (caption, text)
}

/// Paint the caption. Errors are swallowed: Windows 10 does not support these attributes,
/// and a grey title bar is not worth a startup warning.
#[cfg(windows)]
pub fn apply(window: &tauri::WebviewWindow, app: &tauri::AppHandle) {
    let Ok(handle) = window.hwnd() else { return };
    let hwnd = handle.0 as isize;
    let (caption, text) = configured(app);
    for (attr, rgb) in [(DWMWA_CAPTION_COLOR, caption), (DWMWA_TEXT_COLOR, text)] {
        let Some(rgb) = rgb else { continue };
        let value = colorref(rgb);
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                attr,
                &value as *const u32 as *const std::ffi::c_void,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

#[cfg(not(windows))]
pub fn apply(_window: &tauri::WebviewWindow, _app: &tauri::AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colorref_is_bgr_not_rgb() {
        // The trap: COLORREF packs blue in the high byte. Our orange #DD9536 must become
        // 0x003695DD; read as RGB it would be a mid blue, which looks deliberate enough to
        // ship by mistake.
        assert_eq!(colorref(BRAND_ORANGE), 0x003695DD);
        assert_eq!(colorref((0xFF, 0x00, 0x00)), 0x000000FF, "pure red");
        assert_eq!(colorref((0x00, 0x00, 0xFF)), 0x00FF0000, "pure blue");
        assert_eq!(colorref((0x12, 0x34, 0x56)), 0x00563412);
    }

    #[test]
    fn hex_parsing_accepts_both_forms_and_rejects_junk() {
        assert_eq!(parse_hex("#DD9536"), Some((0xDD, 0x95, 0x36)));
        assert_eq!(parse_hex("dd9536"), Some((0xDD, 0x95, 0x36)));
        assert_eq!(parse_hex("  #DD9536  "), Some((0xDD, 0x95, 0x36)));
        assert_eq!(parse_hex("#DD953"), None, "too short");
        assert_eq!(parse_hex("#DD95366"), None, "too long");
        assert_eq!(parse_hex("orange"), None);
        assert_eq!(parse_hex(""), None);
        assert_eq!(parse_hex("#GGGGGG"), None);
    }

    #[test]
    fn brand_colours_match_the_logo() {
        // Sampled from assets/writedown-logo.png: the "down" orange and the "write" navy.
        assert_eq!(BRAND_ORANGE, (0xDD, 0x95, 0x36));
        assert_eq!(BRAND_NAVY, (0x15, 0x38, 0x5D));
    }
}
