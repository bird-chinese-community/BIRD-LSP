import { z } from "zod";

import {
  DEFAULT_HIDDEN_ERRORS,
  DEFAULT_LSP_ENABLED,
  DEFAULT_FORMATTER_ENGINE,
  DEFAULT_FORMATTER_SAFE_MODE,
  DEFAULT_SERVER_PATH,
  DEFAULT_TRACE_SERVER,
  DEFAULT_VALIDATION_COMMAND,
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
  formatterEngine: formatterEngineSchema,
  formatterSafeMode: z.boolean(),
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
    formatterEngine: DEFAULT_FORMATTER_ENGINE,
    formatterSafeMode: DEFAULT_FORMATTER_SAFE_MODE,
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
