import { z } from "zod";

import {
  DEFAULT_HIDDEN_ERRORS,
  DEFAULT_LSP_ENABLED,
  DEFAULT_FORMATTER_ENGINE,
  DEFAULT_FORMATTER_SAFE_MODE,
  DEFAULT_TYPE_HINTS_ENABLED,
  DEFAULT_TYPE_HINTS_HOVER_ENABLED,
  DEFAULT_TYPE_HINTS_INLAY_ENABLED,
  DEFAULT_SERVER_PATH,
  DEFAULT_TRACE_SERVER,
  DEFAULT_VALIDATION_COMMAND,
  DEFAULT_VALIDATION_ON_SAVE,
  DEFAULT_VALIDATION_TIMEOUT_MS,
  EXTENSION_ID,
  EXTENSION_NAME,
} from "./constants.js";

const serverPathSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

export const formatterEngineSchema = z.enum(["dprint", "builtin"]);
export const traceServerSchema = z.enum(["off", "messages", "verbose"]);

export const extensionConfigurationSchema = z.object({
  enabled: z.boolean(),
  serverPath: serverPathSchema,
  traceServer: traceServerSchema,
  hiddenErrors: z.array(z.string().min(1)),
  validationEnabled: z.boolean(),
  validationCommand: z.string().min(1),
  validationOnSave: z.boolean(),
  validationTimeoutMs: z.number().int().min(1000).max(120000),
  formatterEngine: formatterEngineSchema,
  formatterSafeMode: z.boolean(),
  typeHintsEnabled: z.boolean(),
  typeHintsHoverEnabled: z.boolean(),
  typeHintsInlayEnabled: z.boolean(),
});

export type FormatterEngine = z.infer<typeof formatterEngineSchema>;
export type TraceServer = z.infer<typeof traceServerSchema>;
export type ExtensionConfiguration = z.infer<
  typeof extensionConfigurationSchema
>;

export interface ExtensionRuntimeState {
  readonly id: typeof EXTENSION_ID;
  readonly name: typeof EXTENSION_NAME;
  activated: boolean;
  configuration: ExtensionConfiguration;
}

export const defaultExtensionConfiguration: ExtensionConfiguration =
  extensionConfigurationSchema.parse({
    enabled: DEFAULT_LSP_ENABLED,
    serverPath: [...DEFAULT_SERVER_PATH],
    traceServer: DEFAULT_TRACE_SERVER,
    hiddenErrors: [...DEFAULT_HIDDEN_ERRORS],
    validationEnabled: true,
    validationCommand: DEFAULT_VALIDATION_COMMAND,
    validationOnSave: DEFAULT_VALIDATION_ON_SAVE,
    validationTimeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS,
    formatterEngine: DEFAULT_FORMATTER_ENGINE,
    formatterSafeMode: DEFAULT_FORMATTER_SAFE_MODE,
    typeHintsEnabled: DEFAULT_TYPE_HINTS_ENABLED,
    typeHintsHoverEnabled: DEFAULT_TYPE_HINTS_HOVER_ENABLED,
    typeHintsInlayEnabled: DEFAULT_TYPE_HINTS_INLAY_ENABLED,
  });

export const createDefaultRuntimeState = (): ExtensionRuntimeState => ({
  id: EXTENSION_ID,
  name: EXTENSION_NAME,
  activated: false,
  configuration: defaultExtensionConfiguration,
});

export const parseExtensionConfiguration = (
  value: unknown,
): ExtensionConfiguration => {
  const parsed = extensionConfigurationSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  return defaultExtensionConfiguration;
};
