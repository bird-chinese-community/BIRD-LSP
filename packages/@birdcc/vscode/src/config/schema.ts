export const extensionConfigurationFields = {
  enabled: {
    workspaceKey: "enabled",
    packageKey: "bird2-lsp.enabled",
    defaultValue: true,
    restartRequired: true,
  },
  serverPath: {
    workspaceKey: "serverPath",
    packageKey: "bird2-lsp.serverPath",
    defaultValue: ["birdcc", "lsp", "--stdio"] as const,
    restartRequired: true,
  },
  traceServer: {
    workspaceKey: "trace.server",
    packageKey: "bird2-lsp.trace.server",
    defaultValue: "off" as const,
    restartRequired: true,
  },
  hiddenErrors: {
    workspaceKey: "hiddenErrors",
    packageKey: "bird2-lsp.hiddenErrors",
    defaultValue: [
      "textDocument/definition",
      "textDocument/references",
    ] as const,
    restartRequired: true,
  },
  validationEnabled: {
    workspaceKey: "validation.enabled",
    packageKey: "bird2-lsp.validation.enabled",
    defaultValue: true,
    restartRequired: false,
  },
  validationCommand: {
    workspaceKey: "validation.command",
    packageKey: "bird2-lsp.validation.command",
    defaultValue: "bird -p -c {file}",
    restartRequired: false,
  },
  validationOnSave: {
    workspaceKey: "validation.onSave",
    packageKey: "bird2-lsp.validation.onSave",
    defaultValue: true,
    restartRequired: false,
  },
  validationTimeoutMs: {
    workspaceKey: "validation.timeout",
    packageKey: "bird2-lsp.validation.timeout",
    defaultValue: 30000,
    restartRequired: false,
  },
  performanceMaxFileSizeBytes: {
    workspaceKey: "performance.maxFileSizeBytes",
    packageKey: "bird2-lsp.performance.maxFileSizeBytes",
    defaultValue: 2 * 1024 * 1024,
    restartRequired: false,
  },
  lspStartupTimeoutMs: {
    workspaceKey: "performance.startupTimeoutMs",
    packageKey: "bird2-lsp.performance.startupTimeoutMs",
    defaultValue: 10000,
    restartRequired: false,
  },
  formatterEngine: {
    workspaceKey: "formatter.engine",
    packageKey: "bird2-lsp.formatter.engine",
    defaultValue: "dprint" as const,
    restartRequired: false,
  },
  formatterSafeMode: {
    workspaceKey: "formatter.safeMode",
    packageKey: "bird2-lsp.formatter.safeMode",
    defaultValue: true,
    restartRequired: false,
  },
  typeHintsEnabled: {
    workspaceKey: "typeHints.enabled",
    packageKey: "bird2-lsp.typeHints.enabled",
    defaultValue: true,
    restartRequired: false,
  },
  typeHintsHoverEnabled: {
    workspaceKey: "typeHints.hover.enabled",
    packageKey: "bird2-lsp.typeHints.hover.enabled",
    defaultValue: true,
    restartRequired: false,
  },
  typeHintsInlayEnabled: {
    workspaceKey: "typeHints.inlay.enabled",
    packageKey: "bird2-lsp.typeHints.inlay.enabled",
    defaultValue: true,
    restartRequired: false,
  },
  intelEnabled: {
    workspaceKey: "intel.enabled",
    packageKey: "bird2-lsp.intel.enabled",
    defaultValue: true,
    restartRequired: true,
  },
  intelInlayHints: {
    workspaceKey: "intel.inlayHints",
    packageKey: "bird2-lsp.intel.inlayHints",
    defaultValue: true,
    restartRequired: false,
  },
  intelCompletion: {
    workspaceKey: "intel.completion",
    packageKey: "bird2-lsp.intel.completion",
    defaultValue: true,
    restartRequired: false,
  },
  intelHover: {
    workspaceKey: "intel.hover",
    packageKey: "bird2-lsp.intel.hover",
    defaultValue: true,
    restartRequired: false,
  },
} as const;

export type ExtensionConfigurationFieldKey =
  keyof typeof extensionConfigurationFields;

export const restartRequiredConfigurationPaths = Object.freeze(
  (
    Object.entries(extensionConfigurationFields) as ReadonlyArray<
      readonly [
        ExtensionConfigurationFieldKey,
        (typeof extensionConfigurationFields)[ExtensionConfigurationFieldKey],
      ]
    >
  )
    .filter(([, field]) => field.restartRequired)
    .map(([key]) => key),
) as readonly ExtensionConfigurationFieldKey[];
