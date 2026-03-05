import type { BirdDiagnostic } from "@birdcc/core";
import {
  createProtocolDiagnostic,
  createRuleDiagnostic,
  extractFirstNumberAfterKeyword,
  isProtocolType,
  numericValue,
  protocolDeclarations,
  type BirdRule,
} from "./shared.js";

const isInternalSession = (value: string | undefined): boolean =>
  /^(internal|ibgp)$/i.test(value?.trim() ?? "");

const isExternalSession = (value: string | undefined): boolean =>
  /^(external|ebgp)$/i.test(value?.trim() ?? "");

const bgpMissingLocalAsRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "bgp")) {
      continue;
    }

    if (declaration.fromTemplate) {
      continue;
    }

    if (
      declaration.statements.some((statement) => statement.kind === "local-as")
    ) {
      continue;
    }

    diagnostics.push(
      createProtocolDiagnostic(
        "bgp/missing-local-as",
        `BGP protocol '${declaration.name}' missing local AS number`,
        declaration,
      ),
    );
  }

  return diagnostics;
};

const bgpMissingNeighborRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "bgp")) {
      continue;
    }

    if (
      declaration.statements.some((statement) => statement.kind === "neighbor")
    ) {
      continue;
    }

    diagnostics.push(
      createProtocolDiagnostic(
        "bgp/missing-neighbor",
        `BGP protocol '${declaration.name}' missing neighbor configuration`,
        declaration,
      ),
    );
  }

  return diagnostics;
};

const bgpMissingRemoteAsRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "bgp")) {
      continue;
    }

    for (const statement of declaration.statements) {
      if (statement.kind !== "neighbor") {
        continue;
      }

      if (
        isInternalSession(statement.asn) ||
        isExternalSession(statement.asn)
      ) {
        continue;
      }

      if ((statement.asn?.trim().length ?? 0) > 0) {
        continue;
      }

      diagnostics.push(
        createRuleDiagnostic(
          "bgp/missing-remote-as",
          `BGP protocol '${declaration.name}' neighbor '${statement.address}' missing remote AS`,
          statement.asnRange ?? statement.addressRange,
        ),
      );
    }
  }

  return diagnostics;
};

const bgpAsMismatchRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "bgp")) {
      continue;
    }

    const localAsStatement = declaration.statements.find(
      (statement) => statement.kind === "local-as",
    );
    if (!localAsStatement || localAsStatement.kind !== "local-as") {
      continue;
    }

    const localAs = numericValue(localAsStatement.asn);
    if (localAs === null) {
      continue;
    }

    const hasInternalNeighbor = declaration.statements.some(
      (statement) =>
        statement.kind === "neighbor" && isInternalSession(statement.asn),
    );

    if (!hasInternalNeighbor) {
      continue;
    }

    for (const statement of declaration.statements) {
      if (statement.kind !== "neighbor" || !statement.asn) {
        continue;
      }

      if (
        isInternalSession(statement.asn) ||
        isExternalSession(statement.asn)
      ) {
        continue;
      }

      const remoteAs = numericValue(statement.asn);
      if (remoteAs === null || remoteAs === localAs) {
        continue;
      }

      diagnostics.push(
        createRuleDiagnostic(
          "bgp/as-mismatch",
          `BGP protocol '${declaration.name}' internal session requires same ASN (local ${localAs}, remote ${remoteAs})`,
          statement.asnRange ?? statement.addressRange,
        ),
      );
    }
  }

  return diagnostics;
};

const bgpTimerInvalidRule: BirdRule = ({ parsed }) => {
  const diagnostics: BirdDiagnostic[] = [];

  for (const declaration of protocolDeclarations(parsed)) {
    if (!isProtocolType(declaration, "bgp")) {
      continue;
    }

    let hold: number | null = null;
    let keepalive: number | null = null;

    for (const statement of declaration.statements) {
      if (statement.kind !== "other") {
        continue;
      }

      const text = statement.text.toLowerCase();
      const holdValue = extractFirstNumberAfterKeyword(text, "hold");
      const keepaliveValue = extractFirstNumberAfterKeyword(text, "keepalive");

      if (holdValue !== null) {
        hold = holdValue;
        if (hold < 3 || hold > 65_535) {
          diagnostics.push(
            createRuleDiagnostic(
              "bgp/timer-invalid",
              `BGP protocol '${declaration.name}' hold time must be in range 3..65535`,
              statement,
            ),
          );
        }
      }

      if (keepaliveValue !== null) {
        keepalive = keepaliveValue;
        if (keepalive < 1 || keepalive > 65_535) {
          diagnostics.push(
            createRuleDiagnostic(
              "bgp/timer-invalid",
              `BGP protocol '${declaration.name}' keepalive must be in range 1..65535`,
              statement,
            ),
          );
        }
      }
    }

    if (hold !== null && keepalive !== null && keepalive >= hold) {
      diagnostics.push(
        createProtocolDiagnostic(
          "bgp/timer-invalid",
          `BGP protocol '${declaration.name}' keepalive (${keepalive}) must be smaller than hold (${hold})`,
          declaration,
        ),
      );
    }
  }

  return diagnostics;
};

export const bgpRules: BirdRule[] = [
  bgpMissingLocalAsRule,
  bgpMissingNeighborRule,
  bgpMissingRemoteAsRule,
  bgpAsMismatchRule,
  bgpTimerInvalidRule,
];

export const collectBgpRuleDiagnostics = (
  context: Parameters<BirdRule>[0],
): BirdDiagnostic[] => {
  return bgpRules.flatMap((rule) => rule(context));
};
