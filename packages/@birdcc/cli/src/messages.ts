export const CLI_MESSAGES = {
  lintNoDiagnostics: "",
  fmtCheckWriteConflict: "不能同时使用 --check 与 --write",
  fmtInvalidEngine: (engine: string): string =>
    `无效格式化引擎: ${engine}（可选: dprint | builtin）`,
  fmtWritten: "已格式化文件",
  fmtAlreadyFormatted: "文件已是规范格式",
  fmtCheckFailed: "格式检查失败，请执行 `birdcc fmt <file> --write`",
  fmtCheckPassed: "格式检查通过",
  lspRequiresStdio: "当前仅支持 `birdcc lsp --stdio`",
} as const;

export const createBirdRunnerErrorMessage = (reason: string): string =>
  `执行 bird 校验失败: ${reason}`;
