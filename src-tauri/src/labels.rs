//! Quarto cross-reference labels: ONE place that knows what a label looks like (issue E.01).
//!
//! Labels are written two ways, and both have to be understood identically wherever they
//! are read:
//!
//! - `#| label: fig-x` inside an executable cell, and
//! - a `{#fig-x}` attribute block on a heading, figure, table or div — where the `#id` may
//!   sit anywhere in the block (`{width=50% #fig-x .cls}` is as valid as `{#fig-x …}`).
//!
//! Three consumers now read them: the document checker (duplicate detection), the renderer
//! (numbering and anchor rewriting), and the `@`-completion label picker. They used to
//! carry two independent implementations of the same rule; a third copy is the point at
//! which the next Quarto syntax surprise would need fixing in three places, so they share
//! this module instead.

use serde::Serialize;

/// Quarto's cross-reference families. Keep in sync with `CROSSREF_PREFIX` in
/// `src/editor/citations.ts`, which performs the same split on the frontend.
pub const FAMILIES: &[&str] = &[
    "fig", "tbl", "eq", "sec", "lst", "thm", "lem", "cor", "prp", "cnj", "def", "exm", "exr",
    "sol", "rem",
];

/// A label defined in the document, in document order.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct DocLabel {
    /// The label itself, without `@` — e.g. `fig-flood`.
    pub name: String,
    /// 1-based document line where it is defined.
    pub line: usize,
    /// Family prefix (`fig`, `tbl`, …), or "" for a label with no recognised family.
    pub kind: String,
}

/// `#| label: fig-x` inside a cell (quotes stripped).
pub fn cell_label(line: &str) -> Option<String> {
    let t = line.trim_start();
    let rest = t.strip_prefix("#|")?.trim_start();
    let val = rest.strip_prefix("label:")?.trim();
    let val = val.trim_matches(|c| c == '"' || c == '\'').trim();
    (!val.is_empty()).then(|| val.to_string())
}

/// Split a `{ … }` block's content into its first `#id` (in any position) and the other
/// attributes rejoined: `width=50% #fig-x .cls` → (`Some("fig-x")`, `"width=50% .cls"`).
/// The renderer needs the remainder (it rewrites the block); the checker and the picker
/// need only the id — but both must agree on WHICH token is the id.
pub fn split_attr_block(inner: &str) -> (Option<String>, String) {
    let mut id = None;
    let mut rest: Vec<&str> = Vec::new();
    for tok in inner.split_whitespace() {
        if id.is_none() {
            if let Some(t) = tok.strip_prefix('#') {
                if !t.is_empty() {
                    id = Some(t.to_string());
                    continue;
                }
            }
        }
        rest.push(tok);
    }
    (id, rest.join(" "))
}

/// `{#sec-x}`-style attribute labels in one line. Returns (label, brace column).
pub fn attr_labels(line: &str) -> Vec<(String, usize)> {
    let mut out = Vec::new();
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' {
            if let Some(rel) = line[i + 1..].find('}') {
                let close = i + 1 + rel;
                if let Some(id) = split_attr_block(&line[i + 1..close]).0 {
                    out.push((id, i));
                }
                i = close + 1;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// The family of a label (`fig-flood` → `fig`), or "" when it has no recognised prefix.
pub fn family_of(name: &str) -> String {
    match name.split_once('-') {
        Some((head, _)) if FAMILIES.contains(&head) => head.to_string(),
        _ => String::new(),
    }
}

/// Every label defined in `text`, in document order, with duplicates kept — the checker
/// needs every occurrence, and the picker de-duplicates for display.
///
/// Fence-aware: `#| label:` counts only inside an executable (```{lang}) fence, and an
/// attribute block inside any fence is code, not a label.
pub fn scan(text: &str) -> Vec<DocLabel> {
    let lines: Vec<&str> = text.lines().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let trimmed = lines[i].trim_start();
        if let Some(fence) = crate::check::fence_open(trimmed) {
            let mut j = i + 1;
            while j < lines.len() && !crate::check::fence_close(lines[j].trim_start(), fence.ticks) {
                j += 1;
            }
            if fence.lang.is_some() {
                // Executable cell: `#| label:` in any language, not just python.
                for (k, l) in lines[i + 1..j.min(lines.len())].iter().enumerate() {
                    if let Some(name) = cell_label(l) {
                        let kind = family_of(&name);
                        out.push(DocLabel { name, line: i + 2 + k, kind });
                    }
                }
            }
            i = j + 1;
            continue;
        }
        for (name, _col) in attr_labels(lines[i]) {
            let kind = family_of(&name);
            out.push(DocLabel { name, line: i + 1, kind });
        }
        i += 1;
    }
    out
}

/// Labels for the `@` picker: document order, de-duplicated (first definition wins — the
/// checker is what complains about duplicates; the picker should not show one twice).
#[tauri::command]
pub fn document_labels(text: String) -> Vec<DocLabel> {
    let mut seen = std::collections::HashSet::new();
    scan(&text).into_iter().filter(|l| seen.insert(l.name.clone())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(text: &str) -> Vec<String> {
        scan(text).into_iter().map(|l| l.name).collect()
    }

    #[test]
    fn finds_both_flavours_in_document_order() {
        let doc = "\
## Intro {#sec-intro}

```{python}
#| label: fig-flood
plot()
```

![cap](i.png){width=50% #fig-loss}

| a | b |
: Caption {#tbl-rates}
";
        assert_eq!(names(doc), ["sec-intro", "fig-flood", "fig-loss", "tbl-rates"]);
        let all = scan(doc);
        assert_eq!(all[0].line, 1);
        assert_eq!(all[1].line, 4, "cell label reports its own line, not the fence's");
        assert_eq!(all[0].kind, "sec");
        assert_eq!(all[3].kind, "tbl");
    }

    #[test]
    fn a_label_with_no_family_has_empty_kind() {
        let all = scan("# Title {#plain-anchor}\n");
        assert_eq!(all[0].name, "plain-anchor");
        assert_eq!(all[0].kind, "", "`plain` is not a Quarto family");
    }

    #[test]
    fn fenced_content_is_not_scanned_for_attr_labels() {
        // A CSS-ish brace block inside a plain fence must not look like a label.
        let doc = "```\nbody {#not-a-label}\n```\n\n## Real {#sec-real}\n";
        assert_eq!(names(doc), ["sec-real"]);
    }

    #[test]
    fn cell_labels_only_count_inside_executable_fences() {
        let doc = "```\n#| label: fig-nope\n```\n\n```{r}\n#| label: fig-yes\n```\n";
        assert_eq!(names(doc), ["fig-yes"]);
    }

    #[test]
    fn duplicates_are_kept_by_scan_and_dropped_by_the_picker() {
        let doc = "## A {#sec-x}\n\n## B {#sec-x}\n";
        assert_eq!(names(doc).len(), 2, "the checker needs every occurrence");
        let picked = document_labels(doc.to_string());
        assert_eq!(picked.len(), 1, "the picker shows it once");
        assert_eq!(picked[0].line, 1, "first definition wins");
    }

    #[test]
    fn id_is_found_wherever_it_sits_in_the_block() {
        assert_eq!(split_attr_block("#fig-a width=50%").0.as_deref(), Some("fig-a"));
        assert_eq!(split_attr_block("width=50% #fig-b .cls").0.as_deref(), Some("fig-b"));
        assert_eq!(split_attr_block("width=50% .cls").0, None);
        // The remainder keeps the other attributes, in order, minus the id.
        assert_eq!(split_attr_block("width=50% #fig-b .cls").1, "width=50% .cls");
    }

    #[test]
    fn cell_label_strips_quotes_and_ignores_other_options() {
        assert_eq!(cell_label("#| label: \"fig-x\"").as_deref(), Some("fig-x"));
        assert_eq!(cell_label("  #| label: 'fig-y'").as_deref(), Some("fig-y"));
        assert_eq!(cell_label("#| fig-cap: \"not a label\""), None);
        assert_eq!(cell_label("x = 1"), None);
    }
}

#[cfg(test)]
mod bench {
    /// Not a correctness test: it answers "is the scan fast enough to run on every
    /// keystroke?" with a number instead of a guess. `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn scan_speed_on_the_large_doc() {
        let path = r"C:\S\AI\features\large-test-doc-dm.md";
        let Ok(text) = std::fs::read_to_string(path) else {
            eprintln!("skipped: {path} not present");
            return;
        };
        // Warm, then time 100 scans.
        let _ = super::scan(&text);
        let t0 = std::time::Instant::now();
        let mut n = 0;
        for _ in 0..100 {
            n += super::scan(&text).len();
        }
        let per = t0.elapsed().as_secs_f64() * 1000.0 / 100.0;
        eprintln!(
            "scan: {:.3} ms/call over {} KB ({} labels/call)",
            per,
            text.len() / 1024,
            n / 100
        );
    }
}
