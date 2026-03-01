export default grammar({
  name: "birdcc",

  extras: ($) => [/\s/, $.comment],

  word: ($) => $.identifier,

  rules: {
    source_file: ($) => repeat($._top_level_item),

    _top_level_item: ($) =>
      choice(
        $.include_declaration,
        $.define_declaration,
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
    number: () => /[0-9][0-9A-Za-z._:]*/,

    raw_token: () => token(prec(-1, /[^{}\s"';#]+/)),

    include_declaration: ($) => seq("include", optional(field("path", $.string)), ";"),

    define_declaration: ($) =>
      choice(
        seq(
          "define",
          field("name", $.identifier),
          optional(seq("=", repeat1(choice($.string, $.number, $.identifier, $.raw_token, $.block)))),
          ";",
        ),
        seq("define", ";"),
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
        prec(2, seq("filter", field("name", $.identifier), field("body", $.block), optional(";"))),
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

    parameter_list: ($) => seq("(", repeat(choice($.string, $.number, $.identifier, $.raw_token)), ")"),

    return_annotation: ($) => seq("->", repeat1(choice($.identifier, $.raw_token))),

    top_level_statement: ($) =>
      prec(-1, seq(repeat1(choice($.string, $.number, $.identifier, $.raw_token, $.block)), ";")),

    block: ($) => seq("{", repeat($._block_item), "}"),

    _block_item: ($) =>
      choice(
        $.local_as_statement,
        $.neighbor_statement,
        $.import_statement,
        $.export_statement,
        $.block,
        $.string,
        $.number,
        $.identifier,
        $.raw_token,
        ";",
      ),

    local_as_statement: ($) =>
      seq("local", "as", field("asn", choice($.number, $.identifier, $.raw_token)), ";"),

    neighbor_statement: ($) =>
      seq(
        "neighbor",
        field("address", choice($.number, $.identifier, $.string, $.raw_token)),
        optional(seq("as", field("asn", choice($.number, $.identifier, $.raw_token)))),
        ";",
      ),

    import_statement: ($) =>
      choice(
        seq("import", field("clause", choice($.all_clause, $.filter_name_clause, $.generic_clause)), ";"),
        seq("import", field("clause", $.filter_block_clause)),
      ),

    export_statement: ($) =>
      choice(
        seq("export", field("clause", choice($.all_clause, $.filter_name_clause, $.generic_clause)), ";"),
        seq("export", field("clause", $.filter_block_clause)),
      ),

    all_clause: () => "all",

    filter_name_clause: ($) => seq("filter", field("filter_name", $.identifier)),

    filter_block_clause: ($) => seq("filter", field("filter_block", $.block)),

    generic_clause: ($) => repeat1(choice($.string, $.number, $.identifier, $.raw_token, $.block)),
  },
});
