use std::{env, path::PathBuf, process::Command};

fn main() {
    let parser_dir = PathBuf::from("../parser");
    let grammar = parser_dir
        .join("grammar.js")
        .canonicalize()
        .expect("BIRD grammar is required");
    let cli = PathBuf::from("node_modules/tree-sitter-cli/cli.js");
    let output = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR is required"));
    println!("cargo:rerun-if-changed={}", grammar.display());
    println!(
        "cargo:rerun-if-changed={}",
        parser_dir.join("tree-sitter.json").display()
    );
    println!("cargo:rerun-if-changed=node_modules/tree-sitter-cli/package.json");
    let result = Command::new("node")
        .arg(cli)
        .arg("generate")
        .arg("--output")
        .arg(&output)
        .arg(grammar)
        .status()
        .expect("Tree-sitter generation requires Node.js and pnpm install");
    assert!(result.success(), "BIRD grammar generation failed");
    let mut build = cc::Build::new();
    build.include(&output).file(output.join("parser.c"));
    if env::var("TARGET").expect("TARGET is required") == "wasm32-unknown-unknown" {
        build.include(
            env::var("DEP_TREE_SITTER_LANGUAGE_WASM_HEADERS")
                .expect("Tree-sitter WASM headers are required"),
        );
    }
    build.compile("tree-sitter-bird");
}
