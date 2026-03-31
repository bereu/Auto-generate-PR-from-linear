import BE001 from "../../docs/adr/BE-001-layer-architecture.rules.ts";
import BE005 from "../../docs/adr/BE-005-value-domain.rules.ts";
import BE006 from "../../docs/adr/be-006-list-domain.rules.ts";
import GEN001 from "../../docs/adr/GEN-001-magic-number-and-status-management.rules.ts";
import GEN002 from "../../docs/adr/GEN-002-project-folder-structure.rules.ts";

/**
 * Bridge Archgate ADR rules to Oxlint
 *
 * This file translates Archgate RuleSets into an Oxlint plugin.
 */
export default {
  name: "archgate",
  rules: {
    ...BE001.rules,
    ...BE005.rules,
    ...BE006.rules,
    ...GEN001.rules,
    ...GEN002.rules,
  },
};
