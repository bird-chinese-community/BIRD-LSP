use anyhow::Result;
use std::path::Path;

use crate::configuration::Configuration;
use crate::syntax;

fn is_comment_line(line: &str) -> bool {
    line.trim_start().starts_with('#')
}

fn is_word_char(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

fn contains_keyword_as_word(text: &str, keyword: &str) -> bool {
    let mut search_start = 0usize;
    while let Some(relative_index) = text[search_start..].find(keyword) {
        let start = search_start + relative_index;
        let end = start + keyword.len();

        let left_ok = if start == 0 {
            true
        } else {
            !is_word_char(text[..start].chars().next_back().unwrap_or(' '))
        };
        let right_ok = if end >= text.len() {
            true
        } else {
            !is_word_char(text[end..].chars().next().unwrap_or(' '))
        };

        if left_ok && right_ok {
            return true;
        }

        search_start = start + keyword.len();
    }

    false
}

fn is_high_risk_expression_line(line: &str) -> bool {
    let normalized = line.trim();
    if normalized.is_empty() || is_comment_line(normalized) {
        return false;
    }

    let lowered = normalized.to_ascii_lowercase();
    let keyword_risk = contains_keyword_as_word(&lowered, "if")
        || contains_keyword_as_word(&lowered, "then")
        || contains_keyword_as_word(&lowered, "else")
        || contains_keyword_as_word(&lowered, "return");
    let operator_risk = normalized.contains('~')
        || normalized.contains('&')
        || normalized.contains('|')
        || normalized.contains('?')
        || normalized.contains(':')
        || normalized.contains('(')
        || normalized.contains('[')
        || normalized.contains(']');

    keyword_risk || operator_risk
}

fn normalize_non_risk_line(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.is_empty() || is_comment_line(trimmed) {
        return trimmed.to_string();
    }

    if trimmed == "}" || trimmed == "};" {
        return trimmed.to_string();
    }

    if let Some(prefix) = trimmed.strip_suffix('{') {
        return format!("{} {{", prefix.trim_end());
    }

    if let Some(prefix) = trimmed.strip_suffix(';') {
        return format!("{};", prefix.trim_end());
    }

    trimmed.to_string()
}

fn normalize_text_with_builtin(text: &str, config: &Configuration) -> Result<String> {
    let normalized_text = text.replace("\r\n", "\n").replace('\r', "\n");
    let source_lines: Vec<&str> = normalized_text.split('\n').collect();
    let tree = syntax::parse(&normalized_text)?;
    let layout = syntax::layout(&tree, source_lines.len());
    let mut formatted_lines: Vec<String> = Vec::new();

    let mut blank_streak: usize = 0;
    let mut indent_level: usize = 0;

    for (index, original_line) in source_lines.into_iter().enumerate() {
        let tokens = &layout.structural_lines[index];
        let open_count = tokens.iter().filter(|(_, opening)| *opening).count();
        let close_count = tokens.len() - open_count;
        let leading_close = tokens
            .iter()
            .filter(|(column, opening)| {
                !opening
                    && original_line[..*column].chars().all(|character| {
                        character.is_whitespace() || matches!(character, '}' | ']' | '=')
                    })
            })
            .count()
            .min(indent_level);
        indent_level = indent_level.saturating_sub(leading_close);
        let next_indent_level =
            (indent_level + open_count).saturating_sub(close_count.saturating_sub(leading_close));
        if layout.preserved_lines[index] {
            formatted_lines.push(original_line.to_string());
            blank_streak = 0;
            indent_level = next_indent_level;
            continue;
        }
        let trimmed_trailing = original_line.trim_end_matches([' ', '\t']);
        let line = trimmed_trailing.trim();

        if line.is_empty() {
            blank_streak += 1;
            if blank_streak > 1 {
                continue;
            }

            formatted_lines.push(String::new());
            continue;
        }

        blank_streak = 0;

        let code =
            layout.comment_columns[index].map_or(line, |column| original_line[..column].trim());
        let high_risk_line = is_high_risk_expression_line(code);
        let normalized_code = if high_risk_line {
            code.to_string()
        } else {
            normalize_non_risk_line(code)
        };
        let normalized_content = if let Some(column) = layout.comment_columns[index] {
            let separator = if normalized_code.is_empty() { "" } else { " " };
            format!(
                "{}{}{}",
                normalized_code,
                separator,
                &original_line[column..]
            )
        } else {
            normalized_code
        };

        let indent_prefix = " ".repeat(indent_level * usize::from(config.indent_width));
        let formatted_line = format!("{}{}", indent_prefix, normalized_content);

        if (formatted_line.len() as u32) > config.line_width && high_risk_line {
            let content = if layout.comment_columns[index].is_some() {
                original_line.trim_start()
            } else {
                line
            };
            formatted_lines.push(format!("{}{}", indent_prefix, content));
        } else {
            formatted_lines.push(formatted_line);
        }

        indent_level = next_indent_level;
    }

    while matches!(formatted_lines.last(), Some(last) if last.is_empty()) {
        formatted_lines.pop();
    }

    let output = format!("{}\n", formatted_lines.join("\n"));
    if config.safe_mode && output != text {
        if normalized_text == text {
            syntax::ensure_equivalent(text, &tree, &output)?;
        } else {
            let before_tree = syntax::parse(text)?;
            syntax::ensure_equivalent(text, &before_tree, &output)?;
        }
    }
    Ok(output)
}

pub fn format_text(
    _file_path: &Path,
    text: &str,
    config: &Configuration,
) -> Result<Option<String>> {
    let output = normalize_text_with_builtin(text, config)?;
    if output == text {
        Ok(None)
    } else {
        Ok(Some(output))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Configuration {
        Configuration {
            line_width: 80,
            indent_width: 2,
            safe_mode: true,
        }
    }

    #[test]
    fn formats_empty_and_crlf_documents_safely() {
        assert_eq!(
            format_text(Path::new("bird.conf"), "", &config())
                .unwrap()
                .unwrap(),
            "\n"
        );
        assert_eq!(
            format_text(
                Path::new("bird.conf"),
                "# comment\r\nprotocol device {}\r\n",
                &config()
            )
            .unwrap()
            .unwrap(),
            "# comment\nprotocol device {}\n"
        );
    }

    #[test]
    fn safe_mode_preserves_string_carriage_returns() {
        let input = "define LABEL = \"a\rb\";\n";
        assert!(format_text(Path::new("bird.conf"), input, &config()).is_err());
    }

    #[test]
    fn ignores_structural_characters_in_strings() {
        let input = "define LABEL = \"{#]}\";\nprotocol device {\n}\n";
        assert!(format_text(Path::new("bird.conf"), input, &config())
            .unwrap()
            .is_none());
    }

    #[test]
    fn preserves_multiline_comment_contents() {
        let input = "/* {\n  } # [\n\n\n*/\nprotocol device {\nscan time 10;\n}\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .unwrap()
            .unwrap();
        assert_eq!(
            output,
            "/* {\n  } # [\n\n\n*/\nprotocol device {\n  scan time 10;\n}\n"
        );
    }

    #[test]
    fn preserves_inline_comment_contents() {
        let input = "protocol device {} # preserve  {\n";
        assert!(format_text(Path::new("bird.conf"), input, &config())
            .unwrap()
            .is_none());
        let mut unchecked = config();
        unchecked.safe_mode = false;
        assert!(format_text(Path::new("bird.conf"), input, &unchecked)
            .unwrap()
            .is_none());
    }

    #[test]
    fn normalizes_basic_structure() {
        let input = "router id 192.0.2.1;   \n\n\nprotocol bgp edge{}\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .expect("format should succeed")
            .expect("format should change text");

        assert_eq!(output, "router id 192.0.2.1;\n\nprotocol bgp edge{}\n");
    }

    #[test]
    fn keeps_high_risk_expression_layout() {
        let input = "filter t {\nif ( net ~ [ 192.0.2.0/24 ] ) then {\naccept;\n}\n}\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .expect("format should succeed")
            .expect("format should change text");

        assert!(output.contains("if ( net ~ [ 192.0.2.0/24 ] ) then {"));
    }

    #[test]
    fn detects_high_risk_keywords_case_insensitively() {
        let input = "filter t {\nIF ( net ~ [ 192.0.2.0/24 ] ) Then {\naccept;\n}\n}\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .expect("format should succeed")
            .expect("format should change text");

        assert!(output.contains("IF ( net ~ [ 192.0.2.0/24 ] ) Then {"));
    }

    #[test]
    fn avoids_keyword_substring_false_positive() {
        let input = "define iffy = 1;\n";
        let output =
            format_text(Path::new("bird.conf"), input, &config()).expect("format should succeed");
        assert!(output.is_none());
    }

    #[test]
    fn returns_none_when_unchanged() {
        let input = "protocol bgp edge {}\n";
        let output =
            format_text(Path::new("bird.conf"), input, &config()).expect("format should succeed");
        assert!(output.is_none());
    }

    #[test]
    fn ignores_braces_in_comment_only_lines_for_indentation() {
        let input =
            "protocol bgp edge {\n# close brace in comment }\nneighbor 192.0.2.2 as 65002;\n}\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .expect("format should succeed")
            .expect("format should change text");

        assert_eq!(
            output,
            "protocol bgp edge {\n  # close brace in comment }\n  neighbor 192.0.2.2 as 65002;\n}\n"
        );
    }

    #[test]
    fn ignores_braces_in_inline_comments_for_indentation() {
        let input = "protocol bgp edge {\nneighbor 192.0.2.2 as 65002; # open brace in comment {\nrouter id 192.0.2.1;\n}\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .expect("format should succeed")
            .expect("format should change text");

        assert_eq!(
            output,
            "protocol bgp edge {\n  neighbor 192.0.2.2 as 65002; # open brace in comment {\n  router id 192.0.2.1;\n}\n"
        );
    }

    #[test]
    fn indents_multiline_list_literals() {
        let input = "define LIST = [\n1,\n2,\n];\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .expect("format should succeed")
            .expect("format should change text");

        assert_eq!(output, "define LIST = [\n  1,\n  2,\n];\n");
    }

    #[test]
    fn indents_multiline_eq_bracket_set_literals() {
        let input = "define AS_PATH_FILTER = [=\n65001\n65002\n=];\n";
        let output = format_text(Path::new("bird.conf"), input, &config())
            .expect("format should succeed")
            .expect("format should change text");

        assert_eq!(
            output,
            "define AS_PATH_FILTER = [=\n  65001\n  65002\n=];\n"
        );
    }
}
