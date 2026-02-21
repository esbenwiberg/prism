/**
 * Config file detection and purpose identification.
 *
 * Detects and parses configuration files (package.json, tsconfig.json,
 * .env, Docker, CI configs, etc.) to identify tech stack, dependencies,
 * scripts, and overall project configuration.
 */

import type { FileEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Category of a configuration file. */
export type ConfigCategory =
  | "package-manager"
  | "typescript"
  | "linter"
  | "formatter"
  | "bundler"
  | "test"
  | "ci"
  | "docker"
  | "environment"
  | "editor"
  | "git"
  | "database"
  | "deployment"
  | "other";

/** Information extracted from a config file. */
export interface ConfigInfo {
  /** Project-relative file path. */
  filePath: string;
  /** Category of the config file. */
  category: ConfigCategory;
  /** Human-readable purpose description. */
  purpose: string;
  /** Key-value pairs extracted from the config. */
  details: Record<string, string>;
}

/** Aggregated tech stack information from all config files. */
export interface TechStackInfo {
  /** Detected runtime/language. */
  languages: string[];
  /** Detected frameworks. */
  frameworks: string[];
  /** Detected build tools. */
  buildTools: string[];
  /** Detected test frameworks. */
  testFrameworks: string[];
  /** Detected CI/CD systems. */
  ciSystems: string[];
  /** Detected containerization tools. */
  containerization: string[];
  /** Key dependencies. */
  dependencies: string[];
  /** Package scripts. */
  scripts: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Config file patterns
// ---------------------------------------------------------------------------

interface ConfigPattern {
  pattern: RegExp;
  category: ConfigCategory;
  purpose: string;
}

const CONFIG_PATTERNS: ConfigPattern[] = [
  // Package managers
  { pattern: /^package\.json$/i, category: "package-manager", purpose: "Node.js package manifest" },
  { pattern: /^package-lock\.json$/i, category: "package-manager", purpose: "npm lock file" },
  { pattern: /^yarn\.lock$/i, category: "package-manager", purpose: "Yarn lock file" },
  { pattern: /^pnpm-lock\.yaml$/i, category: "package-manager", purpose: "pnpm lock file" },
  { pattern: /^\.npmrc$/i, category: "package-manager", purpose: "npm configuration" },
  { pattern: /^\.yarnrc(\.yml)?$/i, category: "package-manager", purpose: "Yarn configuration" },
  { pattern: /^Cargo\.toml$/i, category: "package-manager", purpose: "Rust package manifest" },
  { pattern: /^go\.mod$/i, category: "package-manager", purpose: "Go module manifest" },
  { pattern: /^requirements\.txt$/i, category: "package-manager", purpose: "Python dependencies" },
  { pattern: /^Pipfile$/i, category: "package-manager", purpose: "Pipenv dependencies" },
  { pattern: /^pyproject\.toml$/i, category: "package-manager", purpose: "Python project configuration" },
  { pattern: /^Gemfile$/i, category: "package-manager", purpose: "Ruby dependencies" },
  { pattern: /^composer\.json$/i, category: "package-manager", purpose: "PHP package manifest" },
  { pattern: /^\.csproj$/i, category: "package-manager", purpose: "C# project file" },
  { pattern: /\.sln$/i, category: "package-manager", purpose: "Visual Studio solution" },
  { pattern: /^nuget\.config$/i, category: "package-manager", purpose: "NuGet configuration" },

  // TypeScript
  { pattern: /^tsconfig(\..+)?\.json$/i, category: "typescript", purpose: "TypeScript configuration" },

  // Linters & formatters
  { pattern: /^\.eslintrc(\.(js|cjs|mjs|json|yml|yaml))?$/i, category: "linter", purpose: "ESLint configuration" },
  { pattern: /^eslint\.config\.(js|cjs|mjs|ts)$/i, category: "linter", purpose: "ESLint flat configuration" },
  { pattern: /^\.prettierrc(\.(js|cjs|json|yml|yaml))?$/i, category: "formatter", purpose: "Prettier configuration" },
  { pattern: /^prettier\.config\.(js|cjs|mjs)$/i, category: "formatter", purpose: "Prettier configuration" },
  { pattern: /^\.stylelintrc(\.(js|cjs|json|yml|yaml))?$/i, category: "linter", purpose: "Stylelint configuration" },
  { pattern: /^\.editorconfig$/i, category: "editor", purpose: "Editor configuration" },
  { pattern: /^biome\.json$/i, category: "linter", purpose: "Biome linter/formatter configuration" },

  // Bundlers
  { pattern: /^webpack\.config\.(js|cjs|mjs|ts)$/i, category: "bundler", purpose: "Webpack configuration" },
  { pattern: /^vite\.config\.(js|ts|mjs)$/i, category: "bundler", purpose: "Vite configuration" },
  { pattern: /^rollup\.config\.(js|cjs|mjs|ts)$/i, category: "bundler", purpose: "Rollup configuration" },
  { pattern: /^esbuild\.config\.(js|cjs|mjs|ts)$/i, category: "bundler", purpose: "esbuild configuration" },
  { pattern: /^turbo\.json$/i, category: "bundler", purpose: "Turborepo configuration" },
  { pattern: /^nx\.json$/i, category: "bundler", purpose: "Nx workspace configuration" },
  { pattern: /^lerna\.json$/i, category: "bundler", purpose: "Lerna monorepo configuration" },

  // Test frameworks
  { pattern: /^vitest\.config\.(js|ts|mjs)$/i, category: "test", purpose: "Vitest configuration" },
  { pattern: /^jest\.config\.(js|cjs|mjs|ts|json)$/i, category: "test", purpose: "Jest configuration" },
  { pattern: /^\.mocharc(\.(js|cjs|json|yml|yaml))?$/i, category: "test", purpose: "Mocha configuration" },
  { pattern: /^cypress\.config\.(js|ts)$/i, category: "test", purpose: "Cypress configuration" },
  { pattern: /^playwright\.config\.(js|ts)$/i, category: "test", purpose: "Playwright configuration" },
  { pattern: /^pytest\.ini$/i, category: "test", purpose: "pytest configuration" },
  { pattern: /^setup\.cfg$/i, category: "test", purpose: "Python setup configuration" },

  // CI/CD
  { pattern: /^\.github\/workflows\/.+\.ya?ml$/i, category: "ci", purpose: "GitHub Actions workflow" },
  { pattern: /^\.gitlab-ci\.ya?ml$/i, category: "ci", purpose: "GitLab CI configuration" },
  { pattern: /^Jenkinsfile$/i, category: "ci", purpose: "Jenkins pipeline" },
  { pattern: /^\.circleci\/config\.ya?ml$/i, category: "ci", purpose: "CircleCI configuration" },
  { pattern: /^\.travis\.ya?ml$/i, category: "ci", purpose: "Travis CI configuration" },
  { pattern: /^azure-pipelines\.ya?ml$/i, category: "ci", purpose: "Azure Pipelines configuration" },
  { pattern: /^bitbucket-pipelines\.ya?ml$/i, category: "ci", purpose: "Bitbucket Pipelines configuration" },

  // Docker
  { pattern: /^Dockerfile(\..+)?$/i, category: "docker", purpose: "Docker image definition" },
  { pattern: /^docker-compose(\..+)?\.ya?ml$/i, category: "docker", purpose: "Docker Compose configuration" },
  { pattern: /^\.dockerignore$/i, category: "docker", purpose: "Docker ignore patterns" },

  // Environment
  { pattern: /^\.env(\..+)?$/i, category: "environment", purpose: "Environment variables" },
  { pattern: /^\.env\.example$/i, category: "environment", purpose: "Environment variables template" },
  { pattern: /^\.env\.sample$/i, category: "environment", purpose: "Environment variables sample" },

  // Git
  { pattern: /^\.gitignore$/i, category: "git", purpose: "Git ignore patterns" },
  { pattern: /^\.gitattributes$/i, category: "git", purpose: "Git attributes" },

  // Database
  { pattern: /^drizzle\.config\.(js|ts)$/i, category: "database", purpose: "Drizzle ORM configuration" },
  { pattern: /^knexfile\.(js|ts)$/i, category: "database", purpose: "Knex migration configuration" },
  { pattern: /^prisma\/schema\.prisma$/i, category: "database", purpose: "Prisma schema" },
  { pattern: /^alembic\.ini$/i, category: "database", purpose: "Alembic migration configuration" },

  // Deployment
  { pattern: /^vercel\.json$/i, category: "deployment", purpose: "Vercel deployment configuration" },
  { pattern: /^netlify\.toml$/i, category: "deployment", purpose: "Netlify deployment configuration" },
  { pattern: /^fly\.toml$/i, category: "deployment", purpose: "Fly.io deployment configuration" },
  { pattern: /^Procfile$/i, category: "deployment", purpose: "Heroku process configuration" },
  { pattern: /^app\.ya?ml$/i, category: "deployment", purpose: "Google App Engine configuration" },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a file is a config file based on its path.
 */
export function isConfigurationFile(relativePath: string): boolean {
  const filename = relativePath.split("/").pop() ?? "";
  return CONFIG_PATTERNS.some((p) => p.pattern.test(filename) || p.pattern.test(relativePath));
}

/**
 * Detect and classify a config file.
 */
export function classifyConfigFile(file: FileEntry): ConfigInfo | null {
  const filename = file.path.split("/").pop() ?? "";

  for (const pat of CONFIG_PATTERNS) {
    if (pat.pattern.test(filename) || pat.pattern.test(file.path)) {
      const details = extractConfigDetails(file, pat.category);
      return {
        filePath: file.path,
        category: pat.category,
        purpose: pat.purpose,
        details,
      };
    }
  }

  return null;
}

/**
 * Parse config files from a batch of FileEntry objects.
 * Returns ConfigInfo for each detected config file.
 */
export function parseConfigFiles(files: FileEntry[]): ConfigInfo[] {
  const results: ConfigInfo[] = [];

  for (const file of files) {
    const info = classifyConfigFile(file);
    if (info) {
      results.push(info);
    }
  }

  return results;
}

/**
 * Build a TechStackInfo summary from the parsed config information.
 */
export function buildTechStack(configs: ConfigInfo[], files: FileEntry[]): TechStackInfo {
  const stack: TechStackInfo = {
    languages: [],
    frameworks: [],
    buildTools: [],
    testFrameworks: [],
    ciSystems: [],
    containerization: [],
    dependencies: [],
    scripts: {},
  };

  // Detect languages from file extensions
  const languageSet = new Set<string>();
  for (const file of files) {
    if (file.language === "typescript" || file.language === "tsx") {
      languageSet.add("TypeScript");
    } else if (file.language === "javascript") {
      languageSet.add("JavaScript");
    } else if (file.language === "python") {
      languageSet.add("Python");
    } else if (file.language === "c_sharp") {
      languageSet.add("C#");
    }
  }
  stack.languages = [...languageSet];

  for (const config of configs) {
    switch (config.category) {
      case "package-manager":
        if (config.details.dependencies) {
          stack.dependencies.push(...config.details.dependencies.split(", "));
        }
        if (config.details.scripts) {
          try {
            const scripts = JSON.parse(config.details.scripts) as Record<string, string>;
            Object.assign(stack.scripts, scripts);
          } catch {
            // Ignore parse errors
          }
        }
        if (config.details.frameworks) {
          stack.frameworks.push(...config.details.frameworks.split(", "));
        }
        break;

      case "bundler":
        stack.buildTools.push(config.purpose);
        break;

      case "test":
        stack.testFrameworks.push(config.purpose);
        break;

      case "ci":
        stack.ciSystems.push(config.purpose);
        break;

      case "docker":
        if (!stack.containerization.includes("Docker")) {
          stack.containerization.push("Docker");
        }
        break;
    }
  }

  // Deduplicate
  stack.dependencies = [...new Set(stack.dependencies)];
  stack.frameworks = [...new Set(stack.frameworks)];
  stack.buildTools = [...new Set(stack.buildTools)];
  stack.testFrameworks = [...new Set(stack.testFrameworks)];
  stack.ciSystems = [...new Set(stack.ciSystems)];

  return stack;
}

/**
 * Build a doc_content summary for a config file.
 */
export function buildConfigDocContent(info: ConfigInfo): string {
  const parts: string[] = [
    `Config: ${info.purpose}`,
    `Category: ${info.category}`,
  ];

  const detailEntries = Object.entries(info.details).filter(
    ([_, v]) => v.length > 0,
  );
  if (detailEntries.length > 0) {
    parts.push("Details:");
    for (const [key, value] of detailEntries) {
      // Truncate long values
      const display = value.length > 200 ? value.substring(0, 200) + "..." : value;
      parts.push(`  ${key}: ${display}`);
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract key details from a config file based on its category.
 */
function extractConfigDetails(
  file: FileEntry,
  category: ConfigCategory,
): Record<string, string> {
  const details: Record<string, string> = {};

  switch (category) {
    case "package-manager":
      extractPackageJsonDetails(file.content, details);
      break;
    case "typescript":
      extractTsconfigDetails(file.content, details);
      break;
    case "docker":
      extractDockerDetails(file.content, file.path, details);
      break;
    case "ci":
      details.type = "CI/CD pipeline configuration";
      break;
    case "environment":
      extractEnvDetails(file.content, details);
      break;
    default:
      break;
  }

  return details;
}

/**
 * Extract details from package.json.
 */
function extractPackageJsonDetails(
  content: string,
  details: Record<string, string>,
): void {
  try {
    const pkg = JSON.parse(content) as Record<string, unknown>;

    if (typeof pkg.name === "string") details.name = pkg.name;
    if (typeof pkg.description === "string") details.description = pkg.description;
    if (typeof pkg.version === "string") details.version = pkg.version;

    // Extract key dependency names
    const deps: string[] = [];
    const frameworks: string[] = [];

    for (const depField of ["dependencies", "devDependencies"] as const) {
      const depObj = pkg[depField];
      if (depObj && typeof depObj === "object") {
        const depNames = Object.keys(depObj as Record<string, unknown>);
        deps.push(...depNames.slice(0, 20)); // Limit to 20

        // Detect common frameworks
        for (const name of depNames) {
          if (/^(react|next|vue|nuxt|angular|express|fastify|nestjs|svelte|remix|astro)$/i.test(name) ||
              /^@(angular|vue|nestjs|svelte)\//i.test(name)) {
            frameworks.push(name);
          }
        }
      }
    }

    if (deps.length > 0) {
      details.dependencies = deps.join(", ");
    }

    if (frameworks.length > 0) {
      details.frameworks = [...new Set(frameworks)].join(", ");
    }

    // Scripts
    if (pkg.scripts && typeof pkg.scripts === "object") {
      details.scripts = JSON.stringify(pkg.scripts);
    }

    // Engines
    if (pkg.engines && typeof pkg.engines === "object") {
      details.engines = JSON.stringify(pkg.engines);
    }
  } catch {
    // Not valid JSON — skip
  }
}

/**
 * Extract details from tsconfig.json.
 */
function extractTsconfigDetails(
  content: string,
  details: Record<string, string>,
): void {
  try {
    // tsconfig allows comments, so strip them first (simple approach)
    const stripped = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const config = JSON.parse(stripped) as Record<string, unknown>;

    const compilerOptions = config.compilerOptions as Record<string, unknown> | undefined;
    if (compilerOptions) {
      if (typeof compilerOptions.target === "string") details.target = compilerOptions.target;
      if (typeof compilerOptions.module === "string") details.module = compilerOptions.module;
      if (typeof compilerOptions.strict === "boolean") details.strict = String(compilerOptions.strict);
    }

    if (typeof config.extends === "string") details.extends = config.extends;
  } catch {
    // Not valid JSON — skip
  }
}

/**
 * Extract details from Docker files.
 */
function extractDockerDetails(
  content: string,
  filePath: string,
  details: Record<string, string>,
): void {
  const filename = filePath.split("/").pop() ?? "";

  if (/^Dockerfile/i.test(filename)) {
    // Extract FROM image
    const fromMatch = content.match(/^FROM\s+(\S+)/im);
    if (fromMatch) {
      details.baseImage = fromMatch[1];
    }
  }
}

/**
 * Extract details from .env files (just the variable names, not values).
 */
function extractEnvDetails(
  content: string,
  details: Record<string, string>,
): void {
  const varNames: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.length === 0) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/i);
    if (match) {
      varNames.push(match[1]);
    }
  }

  if (varNames.length > 0) {
    details.variables = varNames.join(", ");
  }
}
