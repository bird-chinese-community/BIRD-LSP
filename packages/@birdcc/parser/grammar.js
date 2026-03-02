const commaSep1 = (rule) => seq(rule, repeat(seq(",", rule)));

export default grammar({
  name: "bird",

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  rules: {
    // Entry: keep top-level declarations explicit so downstream AST extraction stays stable.
    source_file: ($) => repeat($._top_level_item),

    _top_level_item: ($) =>
      choice(
        $.include_declaration,
        $.define_declaration,
        $.router_id_declaration,
        $.table_declaration,
        $.protocol_declaration,
        $.template_declaration,
        $.filter_declaration,
        $.function_declaration,
        $.top_level_statement,
      ),

    comment: () => token(seq("#", /.*/)),

    string: () =>
      token(
        choice(
          seq('"', repeat(choice(/[^"\\\n]+/, /\\./)), '"'),
          seq("'", repeat(choice(/[^'\\\n]+/, /\\./)), "'"),
        ),
      ),

    identifier: () => /[A-Za-z_][A-Za-z0-9_-]*/,
    number: () => /[0-9][0-9A-Za-z_]*/,
    ipv4_literal: () => token(/[0-9]{1,3}(\.[0-9]{1,3}){3}/),
    ipv6_literal: () => token(/[0-9A-Fa-f]*:[0-9A-Fa-f:]+/),
    ip_literal: ($) => choice($.ipv4_literal, $.ipv6_literal),
    prefix_literal: () =>
      token(/[0-9A-Fa-f:.]+\/[0-9]{1,3}([+-]|\{[0-9]{1,3},[0-9]{1,3}\})?/),

    // Generic fallback token used to keep recovery resilient in partial grammar coverage.
    raw_token: () => token(prec(-1, /[^{}\s"';#]+/)),

    // Top-level declarations
    include_declaration: ($) =>
      seq("include", optional(field("path", $.string)), ";"),

    define_declaration: ($) =>
      choice(
        seq(
          "define",
          field("name", $.identifier),
          optional(
            seq(
              "=",
              repeat1(
                choice(
                  $.string,
                  $.number,
                  $.ip_literal,
                  $.prefix_literal,
                  $.identifier,
                  $.raw_token,
                  $.block,
                ),
              ),
            ),
          ),
          ";",
        ),
        seq("define", ";"),
      ),

    router_id_declaration: ($) =>
      seq("router", "id", optional(field("value", $.router_id_value)), ";"),

    router_id_value: ($) =>
      choice(
        $.router_id_from_clause,
        $.ipv4_literal,
        $.number,
        $.identifier,
        $.raw_token,
      ),

    router_id_from_clause: ($) =>
      seq("from", field("from_source", choice("routing", "dynamic"))),

    table_declaration: ($) =>
      choice(
        seq(
          field("table_type", "routing"),
          "table",
          optional(field("name", $.identifier)),
          optional(field("attrs", $.table_attrs)),
          ";",
        ),
        seq(
          field("table_type", $.table_type),
          "table",
          optional(field("name", $.identifier)),
          optional(field("attrs", $.table_attrs)),
          ";",
        ),
        seq("table", ";"),
      ),

    table_type: () =>
      choice("ipv4", "ipv6", "vpn4", "vpn6", "roa4", "roa6", "flow4", "flow6"),

    table_attrs: ($) =>
      seq(
        "attrs",
        choice(
          $.identifier,
          seq("(", commaSep1(choice($.identifier, $.raw_token)), ")"),
          seq(
            "{",
            repeat(
              choice($.identifier, $.raw_token, $.number, $.string, ",", ";"),
            ),
            "}",
          ),
        ),
      ),

    protocol_declaration: ($) =>
      choice(
        prec(
          1,
          seq(
            "protocol",
            field("protocol_type", $.identifier),
            field("body", $.block),
            optional(";"),
          ),
        ),
        prec(
          2,
          seq(
            "protocol",
            field("protocol_type", $.identifier),
            field("protocol_variant", $.protocol_variant),
            field("name", $.identifier),
            optional(seq("from", field("from_template", $.identifier))),
            field("body", $.block),
            optional(";"),
          ),
        ),
        prec(
          2,
          seq(
            "protocol",
            field("protocol_type", $.identifier),
            field("name", $.identifier),
            optional(seq("from", field("from_template", $.identifier))),
            field("body", $.block),
            optional(";"),
          ),
        ),
      ),

    protocol_variant: () => token(prec(1, /v[0-9]+/)),

    template_declaration: ($) =>
      choice(
        prec(
          1,
          seq(
            "template",
            field("template_type", $.identifier),
            field("body", $.block),
            optional(";"),
          ),
        ),
        prec(
          2,
          seq(
            "template",
            field("template_type", $.identifier),
            field("name", $.identifier),
            field("body", $.block),
            optional(";"),
          ),
        ),
      ),

    filter_declaration: ($) =>
      choice(
        prec(1, seq("filter", field("body", $.block), optional(";"))),
        prec(
          2,
          seq(
            "filter",
            field("name", $.identifier),
            field("body", $.block),
            optional(";"),
          ),
        ),
      ),

    function_declaration: ($) =>
      choice(
        prec(
          1,
          seq(
            "function",
            optional($.parameter_list),
            optional($.return_annotation),
            field("body", $.block),
            optional(";"),
          ),
        ),
        prec(
          2,
          seq(
            "function",
            field("name", $.identifier),
            optional($.parameter_list),
            optional($.return_annotation),
            field("body", $.block),
            optional(";"),
          ),
        ),
      ),

    parameter_list: ($) =>
      seq(
        "(",
        optional(
          commaSep1(
            choice(
              $.identifier,
              $.string,
              $.number,
              $.ip_literal,
              $.prefix_literal,
              $.raw_token,
            ),
          ),
        ),
        ")",
      ),

    return_annotation: ($) =>
      seq("->", repeat1(choice($.identifier, $.raw_token))),

    top_level_statement: ($) =>
      prec(
        -1,
        seq(
          repeat1(
            choice(
              $.string,
              $.number,
              $.ip_literal,
              $.prefix_literal,
              $.identifier,
              $.raw_token,
              $.block,
            ),
          ),
          ";",
        ),
      ),

    // Block is intentionally permissive for error recovery (missing brace / incomplete header).
    block: ($) => seq("{", repeat($._block_item), "}"),

    _block_item: ($) =>
      choice(
        $.local_as_statement,
        $.neighbor_statement,
        $.channel_keep_filtered_statement,
        $.channel_limit_statement,
        $.import_statement,
        $.export_statement,
        $.channel_statement,
        $.if_statement,
        $.accept_statement,
        $.reject_statement,
        $.return_statement,
        $.case_statement,
        $.expression_statement,
        $.block,
        ";",
      ),

    // Protocol common statements used by linter rules.
    local_as_statement: ($) =>
      seq(
        "local",
        "as",
        field("asn", choice($.number, $.identifier, $.raw_token)),
        ";",
      ),

    neighbor_statement: ($) =>
      seq(
        "neighbor",
        field(
          "address",
          choice($.ip_literal, $.number, $.identifier, $.string, $.raw_token),
        ),
        optional(
          seq(
            "%",
            field("interface", choice($.identifier, $.string, $.raw_token)),
          ),
        ),
        optional(
          seq("as", field("asn", choice($.number, $.identifier, $.raw_token))),
        ),
        ";",
      ),

    channel_statement: ($) =>
      choice(
        prec(
          2,
          seq(
            field("channel_type", $.channel_type),
            field("body", $.channel_block),
            ";",
          ),
        ),
        prec(
          1,
          seq(
            field("channel_type", $.channel_type),
            field("body", $.channel_block),
          ),
        ),
        seq(field("channel_type", $.channel_type), ";"),
      ),

    channel_type: () =>
      choice(
        "ipv4",
        "ipv6",
        "vpn4",
        "vpn6",
        "roa4",
        "roa6",
        "flow4",
        "flow6",
        "mpls",
      ),

    channel_block: ($) => seq("{", repeat($._channel_item), "}"),

    _channel_item: ($) =>
      choice(
        $.channel_table_statement,
        $.channel_keep_filtered_statement,
        $.channel_limit_statement,
        $.import_statement,
        $.export_statement,
        $.channel_debug_statement,
        $.if_statement,
        $.accept_statement,
        $.reject_statement,
        $.return_statement,
        $.case_statement,
        $.expression_statement,
        $.block,
        ";",
      ),

    channel_table_statement: ($) =>
      seq("table", field("table_name", $.identifier), ";"),

    channel_keep_filtered_statement: ($) =>
      seq(
        "import",
        "keep",
        "filtered",
        field("switch_value", choice($.identifier, $.number, $.raw_token)),
        ";",
      ),

    channel_limit_statement: ($) =>
      seq(
        field("direction", choice("import", "receive", "export")),
        "limit",
        field(
          "limit_value",
          choice("off", $.number, $.identifier, $.raw_token),
        ),
        optional(
          seq(
            "action",
            field("limit_action", choice($.identifier, $.raw_token)),
          ),
        ),
        ";",
      ),

    channel_debug_statement: ($) =>
      seq(
        "debug",
        field(
          "debug_clause",
          repeat1(
            choice(
              $.identifier,
              $.number,
              $.raw_token,
              $.string,
              "all",
              "off",
              ",",
              "{",
              "}",
            ),
          ),
        ),
        ";",
      ),

    import_statement: ($) =>
      choice(
        seq(
          "import",
          field(
            "clause",
            choice(
              $.all_clause,
              $.none_clause,
              $.where_clause,
              $.filter_name_clause,
              $.generic_clause,
            ),
          ),
          ";",
        ),
        seq("import", field("clause", $.filter_block_clause)),
      ),

    export_statement: ($) =>
      choice(
        seq(
          "export",
          field(
            "clause",
            choice(
              $.all_clause,
              $.none_clause,
              $.where_clause,
              $.filter_name_clause,
              $.generic_clause,
            ),
          ),
          ";",
        ),
        seq("export", field("clause", $.filter_block_clause)),
      ),

    all_clause: () => "all",

    none_clause: () => "none",

    where_clause: ($) =>
      seq("where", field("where_expression", $.simple_expression)),

    filter_name_clause: ($) =>
      seq("filter", field("filter_name", $.identifier)),

    filter_block_clause: ($) => seq("filter", field("filter_block", $.block)),

    generic_clause: ($) =>
      repeat1(
        choice(
          $.string,
          $.number,
          $.ip_literal,
          $.prefix_literal,
          $.identifier,
          $.raw_token,
          $.block,
        ),
      ),

    if_statement: ($) =>
      seq(
        "if",
        optional(field("condition", $.simple_expression)),
        "then",
        field("consequence", $.inline_statement),
        optional(seq("else", field("alternative", $.inline_statement))),
      ),

    inline_statement: ($) =>
      choice(
        $.block,
        $.accept_statement,
        $.reject_statement,
        $.return_statement,
        $.expression_statement,
      ),

    accept_statement: () => seq("accept", ";"),

    reject_statement: () => seq("reject", ";"),

    return_statement: ($) =>
      seq("return", optional(field("value", $.simple_expression)), ";"),

    case_statement: ($) =>
      seq(
        "case",
        optional(field("subject", $.simple_expression)),
        field("body", $.block),
      ),

    expression_statement: ($) =>
      seq(field("expression", $.simple_expression), ";"),

    simple_expression: ($) =>
      choice($.binary_expression, $.unary_expression, $.expression_atom),

    binary_expression: ($) =>
      prec.left(
        seq(
          field("left", $.expression_atom),
          field(
            "operator",
            choice("~", "=", "!=", "<", ">", "<=", ">=", "&&", "||"),
          ),
          field("right", $.expression_atom),
        ),
      ),

    unary_expression: ($) =>
      prec(2, seq(choice("!", "-"), field("value", $.expression_atom))),

    expression_atom: ($) =>
      choice(
        $.function_call,
        $.member_expression,
        $.set_literal,
        $.literal_expression,
        $.identifier,
        $.raw_token,
        seq("(", $.simple_expression, ")"),
      ),

    function_call: ($) =>
      seq(
        field("name", $.identifier),
        "(",
        optional(commaSep1($.simple_expression)),
        ")",
      ),

    member_expression: ($) =>
      seq(
        field("object", $.identifier),
        repeat1(seq(".", field("member", $.identifier))),
      ),

    set_literal: ($) =>
      seq(
        "[",
        repeat(
          choice(
            $.string,
            $.number,
            $.ip_literal,
            $.prefix_literal,
            $.identifier,
            $.raw_token,
            ",",
            "..",
            "+",
            "-",
            "{",
            "}",
            "*",
            "=",
          ),
        ),
        "]",
      ),

    literal_expression: ($) =>
      choice(
        $.string,
        $.number,
        $.ip_literal,
        $.prefix_literal,
        $.bool_literal,
      ),

    bool_literal: () => choice("true", "false"),
  },
});
