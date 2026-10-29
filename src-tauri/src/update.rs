//! Help: Check for Updates (issue J.10): Writedown's single egress point.
//!
//! Eyes-open scope, by ruling: an explicit palette command, never automatic and never at
//! startup. One GET to one fixed URL on one host (`api.github.com`), no request body, no
//! cookies, nothing about the user or their files. It compares the latest GitHub release
//! with this build and reports; the frontend then opens the release page in the default
//! browser. No download, no install (the spec's no-updater rule stands).
//!
//! No HTTP client crate: `curl.exe`, which ships with Windows 10 and later, is run the way
//! git and ripgrep are (no console window, output captured), so nothing new is linked.

use serde::Serialize;
use std::process::Stdio;

/// The only URL Writedown ever requests. The repository is public.
pub const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/mynl/writedown/releases/latest";

/// The releases page, for when the response lacks a usable `html_url`.
const RELEASES_PAGE: &str = "https://github.com/mynl/writedown/releases";

#[derive(Serialize)]
pub struct UpdateInfo {
    /// This build, from Cargo.toml.
    pub current: String,
    /// The latest release's tag, less a leading `v`.
    pub latest: String,
    /// The latest release relative to this build: "newer", "same" or "older".
    pub latest_is: String,
    /// The release page to open (always on github.com).
    pub url: String,
}

/// `2.10.0` → (2, 10, 0). A pre-release or build suffix (`-rc1`, `+x`) is ignored, and a
/// missing or non-numeric part counts as 0, so the comparison never fails.
fn semver(v: &str) -> (u64, u64, u64) {
    let core = v.trim().trim_start_matches(['v', 'V']);
    let core = core.split(['-', '+']).next().unwrap_or("");
    let mut it = core.split('.').map(|p| p.parse::<u64>().unwrap_or(0));
    (it.next().unwrap_or(0), it.next().unwrap_or(0), it.next().unwrap_or(0))
}

/// The host of an absolute URL: the text between `://` and the next `/`, `:` or `?`.
fn host_of(url: &str) -> Option<&str> {
    let rest = url.split_once("://")?.1;
    rest.split(['/', ':', '?']).next()
}

/// Ask GitHub for the latest release and compare it with this build.
///
/// Errors (curl missing, offline, timeout after 10 s, an HTTP error such as GitHub's rate
/// limit, an unparsable reply) come back as a message for the error strip.
#[tauri::command(async)]
pub fn check_for_update() -> Result<UpdateInfo, String> {
    let mut cmd = crate::tripwire::command("update", "curl.exe");
    cmd.args([
        "-s",
        "-S", // with -s: still print the error message on failure
        "-f", // an HTTP error status is a failure, not a JSON body to misread
        "-m",
        "10",
        "--proto",
        "=https",
        "-H",
        "Accept: application/vnd.github+json",
        LATEST_RELEASE_URL,
    ])
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd.output().map_err(|e| format!("check for updates: cannot run curl.exe ({e})"))?;
    if !out.status.success() {
        let why = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(format!(
            "check for updates: {}",
            if why.is_empty() { "the request failed (offline?)".to_string() } else { why }
        ));
    }
    let v: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("check for updates: unreadable reply ({e})"))?;
    let tag = v
        .get("tag_name")
        .and_then(|t| t.as_str())
        .ok_or("check for updates: the reply has no tag_name")?;
    // Only a github.com page is ever handed to the browser.
    let url = v
        .get("html_url")
        .and_then(|u| u.as_str())
        .filter(|u| u.starts_with("https://") && host_of(u) == Some("github.com"))
        .unwrap_or(RELEASES_PAGE)
        .to_string();
    let current = env!("CARGO_PKG_VERSION").to_string();
    let latest = tag.trim_start_matches(['v', 'V']).to_string();
    let latest_is = match semver(&latest).cmp(&semver(&current)) {
        std::cmp::Ordering::Greater => "newer",
        std::cmp::Ordering::Equal => "same",
        std::cmp::Ordering::Less => "older",
    };
    Ok(UpdateInfo { current, latest, latest_is: latest_is.to_string(), url })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The egress allow-list, enforced: one URL, https, exactly api.github.com.
    #[test]
    fn the_only_url_is_https_on_api_github_com() {
        assert!(LATEST_RELEASE_URL.starts_with("https://"));
        assert_eq!(host_of(LATEST_RELEASE_URL), Some("api.github.com"));
        assert_eq!(host_of(RELEASES_PAGE), Some("github.com"));
    }

    #[test]
    fn versions_compare_numerically() {
        assert!(semver("2.9.0") < semver("2.10.0"));
        assert!(semver("v2.25.0") == semver("2.25.0"));
        assert!(semver("2.26.0") > semver("2.25.9"));
        assert_eq!(semver("3.0.0-rc1"), (3, 0, 0));
        assert_eq!(semver("junk"), (0, 0, 0));
    }
}
