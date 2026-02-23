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
  renderChatThread,
  renderMilestoneCard,
  type PlanListItem,
  type PlanViewData,
  type PhaseViewData,
  type MilestoneViewData,
  type BlueprintsListPageData,
  type BlueprintDetailPageData,
  type ChatEntry,
  type ProposedEdit,
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

export { logsPage } from "./logs.js";
export { healthPage, statsPartial, type SystemStats } from "./health.js";
export {
  settingsPage,
  settingsPanel,
  analysisTabPartial,
  indexerTabPartial,
  type SettingsTab,
} from "./settings.js";
export { promptsPage, promptEditorPartial } from "./prompts.js";

export {
  symbolsPage,
  symbolsFragment,
  type SymbolViewData,
  type SymbolsPageData,
} from "./symbols.js";

export {
  purposePage,
  purposeFragment,
  type PurposePageData,
} from "./purpose.js";

export {
  summariesPage,
  summariesFragment,
  type SummaryViewData,
  type SummariesPageData,
} from "./summaries.js";
