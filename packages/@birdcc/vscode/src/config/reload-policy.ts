export interface LifecycleConfigurationChange {
  readonly changedPaths: readonly string[];
}

export const shouldRunLifecycleForConfigurationChange = (
  change: LifecycleConfigurationChange,
): boolean => change.changedPaths.length > 0;
