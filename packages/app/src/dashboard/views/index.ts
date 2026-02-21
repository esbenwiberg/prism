/**
 * Dashboard views barrel export.
 */

export {
  escapeHtml,
  badge,
  card,
  statCard,
  table,
  severityBadge,
  statusBadge,
  type BadgeVariant,
  type TableColumn,
} from "./components.js";

export { layout, type LayoutOptions } from "./layout.js";
export { overviewPage, overviewFragment } from "./overview.js";
export { projectPage, projectFragment, type ProjectPageData } from "./project.js";
export {
  filesPage,
  filesFragment,
  type FileViewData,
  type FilesPageData,
} from "./files.js";
export {
  findingsPage,
  findingsFragment,
  type FindingViewData,
  type FindingsPageData,
} from "./findings.js";
export {
  searchPage,
  searchFragment,
  type SearchResultViewData,
  type SearchPageData,
} from "./search.js";

export {
  blueprintsListPage,
  blueprintsListFragment,
  blueprintDetailPage,
  blueprintDetailFragment,
  type PlanListItem,
  type PlanViewData,
  type PhaseViewData,
  type MilestoneViewData,
  type BlueprintsListPageData,
  type BlueprintDetailPageData,
} from "./blueprints.js";

export {
  graphPage,
  graphFragment,
  type GraphPageData,
} from "./graph.js";

export {
  modulesPage,
  modulesFragment,
  type ModuleViewData,
  type ModulesPageData,
} from "./modules.js";

export {
  credentialsPage,
  credentialsFragment,
  type CredentialsPageData,
} from "./credentials.js";

export {
  addProjectPage,
  addProjectFragment,
  type AddProjectPageData,
} from "./add-project.js";

export {
  jobProgressFragment,
  type JobProgressData,
} from "./job-progress.js";
