import { z } from "zod";

import {
  DEFAULT_FORMATTER_ENGINE,
  DEFAULT_FORMATTER_SAFE_MODE,
  DEFAULT_SERVER_PATH,
  DEFAULT_VALIDATION_COMMAND,
  EXTENSION_ID,
  EXTENSION_NAME,
} from "./constants.js";

const serverPathSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

export const formatterEngineSchema = z.enum(["dprint", "builtin"]);

export const extensionConfigurationSchema = z.object({
  serverPath: serverPathSchema,
  validationEnabled: z.boolean(),
  validationCommand: z.string().min(1),
  formatterEngine: formatterEngineSchema,
  formatterSafeMode: z.boolean(),
});

export type FormatterEngine = z.infer<typeof formatterEngineSchema>;
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
    serverPath: [...DEFAULT_SERVER_PATH],
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
