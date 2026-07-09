import { Workspace, LocalFilesystem } from "@mastra/core/workspace";
import { DOMAIN_DOCS_DIR } from "@/slack-bug-intake/slack-bug-intake.constants";
import path from "path";

/**
 * Shared read-only Workspace for domain documentation access.
 *
 * Provides list/read/search file tools scoped to docs/domain with read-only enforcement.
 * When attached to an Agent via the `workspace` option, Mastra automatically provides
 * these tools, and the agent can use them to discover and read relevant bounded-context
 * docs during triage and complexity assessment.
 *
 * The workspace is initialized once at module load and reused by both the triage agent
 * and the complexity agent.
 */
export const domainDocsWorkspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: path.resolve(DOMAIN_DOCS_DIR),
    readOnly: true,
  }),
});
