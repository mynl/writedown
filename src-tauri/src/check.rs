//! Fast document checks for Markdown/Quarto: Python syntax validation of ```{python}
//! cells and duplicate Quarto label detection. Entirely in-process — rustpython-parser is
//! compiled into the app, so there is no external Python, environment, or PATH to break.

use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize)]
pub struct Diagnostic {
    /// 1-based document line.
    pub line: usize,
    /// 0-based column within that line.
    pub col: usize,
    pub message: String,
    pub severity: &'static str, // "error" | "warning"
}

#[tauri::command]
pub fn check_document(text: String) -> Vec<Diagnostic> {
    check(&text)
}

pub(crate) struct Fence {
    pub(crate) ticks: usize,
    // Some("python") for ```{python}; None for non-executable fences
    pub(crate) lang: Option<String>,
}

/// Parse a fence opener: ```` ```{python} ````, ```` ```{r, opts} ````, or plain ```` ``` ````.
pub(crate) fn fence_open(trimmed: &str) -> Option<Fence> {
    let ticks = trimmed.chars().take_while(|c| *c == '`').count();
    if ticks < 3 {
        return None;
    }
    let rest = trimmed[ticks..].trim_start();
    let lang = rest.strip_prefix('{').map(|r| {
        r.chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '=')
            .collect::<String>()
            .to_lowercase()
    });
    Some(Fence { ticks, lang })
}

pub(crate) fn fence_close(trimmed: &str, open_ticks: usize) -> bool {
    let ticks = trimmed.chars().take_while(|c| *c == '`').count();
    ticks >= open_ticks && trimmed[ticks..].trim().is_empty()
}

/// `#| label: fig-x` inside a cell (quotes stripped).
pub(crate) fn cell_label(line: &str) -> Option<String> {
    let t = line.trim_start();
    let rest = t.strip_prefix("#|")?.trim_start();
    let val = rest.strip_prefix("label:")?.trim();
    let val = val.trim_matches(|c| c == '"' || c == '\'').trim();
    (!val.is_empty()).then(|| val.to_string())
}

/// `{#sec-x}`-style attribute labels in prose (headings, divs, figures).
pub(crate) fn attr_labels(line: &str) -> Vec<(String, usize)> {
    let mut out = Vec::new();
    let bytes = line.as_bytes();
    let mut i = 0;
    while i + 2 < bytes.len() {
        if bytes[i] == b'{' && bytes[i + 1] == b'#' {
            let start = i + 2;
            let end = line[start..]
                .find(|c: char| c.is_whitespace() || c == '}')
                .map(|p| start + p)
                .unwrap_or(line.len());
            if end > start {
                out.push((line[start..end].to_string(), i));
            }
            i = end;
        } else {
            i += 1;
        }
    }
    out
}

/// Syntax-check one python cell. `first_doc_line` is the 1-based document line of the
/// cell's first body line. Reports the first parse error (as Python itself would).
fn check_python(body: &[&str], first_doc_line: usize, out: &mut Vec<Diagnostic>) {
    // IPython-isms (%magic, !shell, ?help) are not Python — blank them, preserving line
    // numbering. `#|` option comments are ordinary comments and need no handling.
    let cleaned: Vec<&str> = body
        .iter()
        .map(|l| {
            let t = l.trim_start();
            if t.starts_with('%') || t.starts_with('!') || t.starts_with('?') {
                ""
            } else {
                *l
            }
        })
        .collect();
    let src = cleaned.join("\n");
    if src.trim().is_empty() {
        return;
    }
    if let Err(e) = rustpython_parser::parse(&src, rustpython_parser::Mode::Module, "<cell>") {
        let off = usize::from(e.offset).min(src.len());
        let rel_line = src[..off].matches('\n').count();
        let line_start = src[..off].rfind('\n').map(|p| p + 1).unwrap_or(0);
        out.push(Diagnostic {
            line: first_doc_line + rel_line,
            col: off - line_start,
            message: format!("Python: {}", e.error),
            severity: "error",
        });
    }
}

fn check(text: &str) -> Vec<Diagnostic> {
    let lines: Vec<&str> = text.lines().collect();
    let mut out = Vec::new();
    // label -> occurrences (1-based line, 0-based col)
    let mut labels: HashMap<String, Vec<(usize, usize)>> = HashMap::new();

    let mut i = 0;
    while i < lines.len() {
        let trimmed = lines[i].trim_start();
        if let Some(fence) = fence_open(trimmed) {
            let mut j = i + 1;
            while j < lines.len() && !fence_close(lines[j].trim_start(), fence.ticks) {
                j += 1;
            }
            let body = &lines[i + 1..j.min(lines.len())];
            if fence.lang.is_some() {
                // Executable cell: collect `#| label:` (any language).
                for (k, l) in body.iter().enumerate() {
                    if let Some(lab) = cell_label(l) {
                        let col = l.len() - l.trim_start().len();
                        labels.entry(lab).or_default().push((i + 2 + k, col));
                    }
                }
            }
            if fence.lang.as_deref() == Some("python") {
                check_python(body, i + 2, &mut out);
            }
            i = j + 1;
            continue;
        }
        for (lab, col) in attr_labels(lines[i]) {
            labels.entry(lab).or_default().push((i + 1, col));
        }
        i += 1;
    }

    // Duplicate labels: warn at every occurrence, cross-referencing the others.
    for (lab, occ) in labels {
        if occ.len() < 2 {
            continue;
        }
        for &(line, col) in &occ {
            let others: Vec<String> = occ
                .iter()
                .filter(|(l, _)| *l != line)
                .map(|(l, _)| l.to_string())
                .collect();
            out.push(Diagnostic {
                line,
                col,
                message: format!("duplicate label '{lab}' (also at line {})", others.join(", ")),
                severity: "warning",
            });
        }
    }

    out.sort_by_key(|d| (d.line, d.col));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn python_error_maps_to_document_line() {
        let doc = "# Title\n\n```{python}\nx = 1\ndef f(:\n```\n";
        let d = check(doc);
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].severity, "error");
        assert_eq!(d[0].line, 5); // `def f(:` is document line 5
    }

    #[test]
    fn clean_python_and_magics_pass() {
        let doc = "```{python}\n%matplotlib inline\n!pip list\nimport math\nprint(math.pi)\n```\n";
        assert!(check(doc).is_empty());
    }

    #[test]
    fn duplicate_labels_flagged_everywhere() {
        let doc = "## A {#sec-x}\n\n```{python}\n#| label: sec-x\n1 + 1\n```\n\n## B {#sec-y}\n";
        let d = check(doc);
        assert_eq!(d.len(), 2); // both occurrences of sec-x, sec-y clean
        assert!(d.iter().all(|x| x.severity == "warning" && x.message.contains("sec-x")));
        assert_eq!(d[0].line, 1);
        assert_eq!(d[1].line, 4);
    }

    #[test]
    fn non_python_cells_ignored_for_syntax() {
        let doc = "```{r}\nlibrary(ggplot2) %>% oops(\n```\n";
        assert!(check(doc).is_empty());
    }
}
