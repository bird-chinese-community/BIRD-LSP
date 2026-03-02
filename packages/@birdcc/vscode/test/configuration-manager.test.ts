import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConfigurationManager } from "../src/config/configuration.js";

const configStore: Record<string, unknown> = {};

const listeners = new Set<(value: unknown) => void>();

vi.mock("vscode", () => {
  class EventEmitter<T> {
    public event = (listener: (value: T) => void) => {
      listeners.add(listener as (value: unknown) => void);
      return {
        dispose: () => {
          listeners.delete(listener as (value: unknown) => void);
        },
      };
    };

    public fire(value: T): void {
      for (const listener of listeners) {
        listener(value);
      }
    }

    public dispose(): void {
      listeners.clear();
    }
  }

  return {
    EventEmitter,
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: (key: string, defaultValue: unknown) =>
          key in configStore ? configStore[key] : defaultValue,
      })),
    },
  };
});

describe("configuration manager", () => {
  beforeEach(() => {
    for (const key of Object.keys(configStore)) {
      delete configStore[key];
    }
    listeners.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reports restart-required change for trace.server via runtime key", () => {
    const manager = createConfigurationManager();
    const events: unknown[] = [];

    manager.onDidChange((event) => {
      events.push(event);
    });

    configStore["trace.server"] = "verbose";
    const change = manager.refreshFromWorkspace("workspace-change");

    expect(change.changedPaths).toContain("traceServer");
    expect(change.requiresRestart).toBe(true);
    expect(events).toHaveLength(1);
  });

  it("does not require restart for validation timeout-only change", () => {
    const manager = createConfigurationManager();

    configStore["validation.timeout"] = 45000;
    const change = manager.refreshFromWorkspace("workspace-change");

    expect(change.changedPaths).toContain("validationTimeoutMs");
    expect(change.requiresRestart).toBe(false);
  });
});
