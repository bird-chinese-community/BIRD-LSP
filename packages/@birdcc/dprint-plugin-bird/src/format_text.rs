use anyhow::Result;
use std::path::Path;

use crate::configuration::Configuration;

fn count_token(text: &str, token: char) -> usize {
    text.chars().filter(|character| *character == token).count()
}

fn count_structural_tokens(text: &str) -> (usize, usize) {
    let opens = count_token(text, '{') + count_token(text, '[');
    let closes = count_token(text, '}') + count_token(text, ']');
    (opens, closes)
}

fn count_leading_close_tokens(text: &str) -> usize {
    let mut count = 0;
    let mut chars = text.chars().peekable();
    while let Some(current) = chars.next() {
        if current == '}' || current == ']' {
            count += 1;
            continue;
        }
        // BIRD `[= ... =]` set literal closing — `=]` signals close
        if current == '=' && chars.peek() == Some(&']') {
            chars.next(); // consume the ']'
            count += 1;
            continue;
        }
        break;
    }
    count
}

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

fn normalize_text_with_builtin(text: &str, config: &Configuration) -> String {
    let normalized_text = text.replace("\r\n", "\n").replace('\r', "\n");
    let source_lines: Vec<&str> = normalized_text.split('\n').collect();
    let mut formatted_lines: Vec<String> = Vec::new();

    let mut blank_streak: usize = 0;
    let mut indent_level: usize = 0;

    for original_line in source_lines {
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

        let structural_line = line
            .split_once('#')
            .map(|(before_comment, _)| before_comment.trim_end())
            .unwrap_or(line);

        let (open_count, close_count) = count_structural_tokens(structural_line);
        let leading_close = count_leading_close_tokens(structural_line).min(indent_level);
        indent_level = indent_level.saturating_sub(leading_close);

        let high_risk_line = is_high_risk_expression_line(line);
        let normalized_content = if high_risk_line {
            line.to_string()
        } else {
            normalize_non_risk_line(line)
        };

        let indent_prefix = " ".repeat(indent_level * usize::from(config.indent_width));
        let formatted_line = format!("{}{}", indent_prefix, normalized_content);

        // Keep ultra-long lines mostly untouched to avoid semantic risk from wrapping logic.
        if (formatted_line.len() as u32) > config.line_width && high_risk_line {
            formatted_lines.push(format!("{}{}", indent_prefix, line));
        } else {
            formatted_lines.push(formatted_line);
        }

        let post_close_count = close_count.saturating_sub(leading_close);
        let delta = open_count as isize - post_close_count as isize;
        let next_level = indent_level as isize + delta;
        indent_level = next_level.max(0) as usize;
    }

    while matches!(formatted_lines.last(), Some(last) if last.is_empty()) {
        formatted_lines.pop();
    }

    format!("{}\n", formatted_lines.join("\n"))
}

pub fn format_text(
    _file_path: &Path,
    text: &str,
    config: &Configuration,
) -> Result<Option<String>> {
    let output = normalize_text_with_builtin(text, config);
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
