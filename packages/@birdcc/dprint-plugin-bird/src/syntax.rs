use anyhow::{bail, Context, Result};
use std::borrow::Cow;
use tree_sitter::{Node, Parser, Tree};
use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_bird() -> *const ();
}

pub fn parse(text: &str) -> Result<Tree> {
    let mut parser = Parser::new();
    // The generated language has process lifetime and ABI 15, supported by this runtime.
    let language = unsafe { LanguageFn::from_raw(tree_sitter_bird) };
    parser
        .set_language(&language.into())
        .context("Loading BIRD grammar")?;
    parser
        .parse(text, None)
        .context("Parsing BIRD configuration")
}

pub struct Layout {
    pub structural_lines: Vec<Vec<(usize, bool)>>,
    pub preserved_lines: Vec<bool>,
    pub comment_columns: Vec<Option<usize>>,
}

fn visit_tree<'tree>(tree: &'tree Tree, mut visit: impl FnMut(Node<'tree>)) {
    let mut cursor = tree.walk();
    loop {
        visit(cursor.node());
        if cursor.goto_first_child() {
            continue;
        }
        loop {
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                return;
            }
        }
    }
}

pub fn layout(tree: &Tree, line_count: usize) -> Layout {
    let mut lines = vec![Vec::new(); line_count];
    let mut preserved = vec![false; line_count];
    let mut comment_columns = vec![None; line_count];
    visit_tree(tree, |node| {
        let opening = match node.kind() {
            "{" | "[" => Some(true),
            "}" | "]" => Some(false),
            _ => None,
        };
        if let Some(opening) = opening {
            if let Some(line) = lines.get_mut(node.start_position().row) {
                line.push((node.start_position().column, opening));
            }
        }
        if node.kind() == "comment" {
            comment_columns[node.start_position().row].get_or_insert(node.start_position().column);
        }
        if node.kind() == "comment" && node.start_position().row != node.end_position().row {
            for line in &mut preserved[node.start_position().row..=node.end_position().row] {
                *line = true;
            }
        }
    });
    Layout {
        structural_lines: lines,
        preserved_lines: preserved,
        comment_columns,
    }
}

fn fingerprint<'a>(tree: &Tree, text: &'a str) -> Vec<(u16, u32, bool, Cow<'a, str>)> {
    let mut output = Vec::new();
    visit_tree(tree, |node| {
        let content = if node.child_count() == 0 && node.kind() != "source_file" {
            let token = &text[node.byte_range()];
            if node.kind() == "comment" && token.contains('\r') {
                Cow::Owned(token.replace('\r', ""))
            } else {
                Cow::Borrowed(token)
            }
        } else {
            Cow::Borrowed("")
        };
        output.push((
            node.kind_id(),
            node.child_count(),
            node.is_missing(),
            content,
        ));
    });
    output
}

pub fn ensure_equivalent(before: &str, before_tree: &Tree, after: &str) -> Result<()> {
    let after_tree = parse(after)?;
    let before_tokens = fingerprint(before_tree, before);
    let after_tokens = fingerprint(&after_tree, after);
    if before_tokens != after_tokens {
        bail!("Formatter safe mode rejected output because syntax or token content changed");
    }
    Ok(())
}
