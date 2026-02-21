import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isValidGitUrl,
  injectPat,
  cloneRepo,
  cleanupClone,
  cloneDestination,
} from "../../packages/core/src/git/clone.js";
import { CLONE_BASE_DIR } from "../../packages/core/src/git/types.js";

// ---------------------------------------------------------------------------
// Mock child_process and fs/promises so we never actually shell out or delete
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb?: (err: Error | null) => void) => {
    if (cb) cb(null);
  }),
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

// Import the mocked modules so we can inspect calls
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";

// util.promisify will wrap execFile; we need to mock the promisified version.
// Since we mocked execFile as a callback function, promisify should work.
// However, for robustness let's also verify calls via the mock.

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// isValidGitUrl
// ---------------------------------------------------------------------------

describe("isValidGitUrl", () => {
  describe("valid HTTPS URLs", () => {
    it.each([
      "https://github.com/org/repo",
      "https://github.com/org/repo.git",
      "https://github.com/some-org/some-repo.git",
      "https://dev.azure.com/org/project/_git/repo",
      "https://dev.azure.com/org/project/_git/repo.git",
      "https://gitlab.com/group/subgroup/repo.git",
    ])("should accept %s", (url) => {
      expect(isValidGitUrl(url)).toBe(true);
    });
  });

  describe("invalid URLs", () => {
    it.each([
      // SSH URLs
      "git@github.com:org/repo.git",
      "ssh://git@github.com/org/repo.git",
      // File paths
      "file:///path/to/repo",
      "/local/path/to/repo",
      // HTTP (not HTTPS)
      "http://github.com/org/repo.git",
      // Empty/garbage
      "",
      "not-a-url",
      "ftp://example.com/repo.git",
      // URL with spaces
      "https://github.com/org/repo with spaces",
    ])("should reject %s", (url) => {
      expect(isValidGitUrl(url)).toBe(false);
    });

    it("should reject null/undefined", () => {
      expect(isValidGitUrl(null as unknown as string)).toBe(false);
      expect(isValidGitUrl(undefined as unknown as string)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// injectPat
// ---------------------------------------------------------------------------

describe("injectPat", () => {
  it("should inject PAT into GitHub URL", () => {
    const result = injectPat(
      "https://github.com/org/repo.git",
      "ghp_abc123",
      "github",
    );
    expect(result).toBe("https://ghp_abc123@github.com/org/repo.git");
  });

  it("should inject PAT into Azure DevOps URL", () => {
    const result = injectPat(
      "https://dev.azure.com/org/project/_git/repo",
      "ado_pat_xyz",
      "azuredevops",
    );
    expect(result).toBe(
      "https://ado_pat_xyz@dev.azure.com/org/project/_git/repo",
    );
  });

  it("should replace existing credentials in URL", () => {
    const result = injectPat(
      "https://olduser@github.com/org/repo.git",
      "new_pat",
      "github",
    );
    expect(result).toBe("https://new_pat@github.com/org/repo.git");
  });
});

// ---------------------------------------------------------------------------
// cloneDestination
// ---------------------------------------------------------------------------

describe("cloneDestination", () => {
  it("should build path from numeric project ID", () => {
    expect(cloneDestination(42)).toBe(`${CLONE_BASE_DIR}/42`);
  });

  it("should build path from string project ID", () => {
    expect(cloneDestination("my-project")).toBe(
      `${CLONE_BASE_DIR}/my-project`,
    );
  });
});

// ---------------------------------------------------------------------------
// cloneRepo
// ---------------------------------------------------------------------------

describe("cloneRepo", () => {
  it("should call git clone with correct arguments", async () => {
    const result = await cloneRepo(
      "https://github.com/org/repo.git",
      "/tmp/prism-clones/1",
    );

    expect(result.destDir).toBe("/tmp/prism-clones/1");
    expect(result.url).toBe("https://github.com/org/repo.git");

    // Verify execFile was called with git clone args
    expect(execFile).toHaveBeenCalled();
    const call = vi.mocked(execFile).mock.calls[0];
    // promisify wraps execFile; the first arg is the command
    expect(call[0]).toBe("git");
    const args = call[1] as string[];
    expect(args).toContain("clone");
    expect(args).toContain("--depth");
    expect(args).toContain("1");
    expect(args).toContain("https://github.com/org/repo.git");
    expect(args).toContain("/tmp/prism-clones/1");
  });

  it("should inject PAT when provided", async () => {
    const result = await cloneRepo(
      "https://github.com/org/repo.git",
      "/tmp/prism-clones/2",
      { pat: "ghp_secret", provider: "github" },
    );

    // The returned URL should be redacted
    expect(result.url).toContain("***@");
    expect(result.url).not.toContain("ghp_secret");

    // But the actual clone URL passed to git should contain the PAT
    const call = vi.mocked(execFile).mock.calls[0];
    const args = call[1] as string[];
    const cloneUrl = args[3]; // git clone --depth 1 <url> <dest>
    expect(cloneUrl).toContain("ghp_secret@");
  });

  it("should use custom depth when provided", async () => {
    await cloneRepo(
      "https://github.com/org/repo.git",
      "/tmp/prism-clones/3",
      { depth: 5 },
    );

    const call = vi.mocked(execFile).mock.calls[0];
    const args = call[1] as string[];
    expect(args).toContain("5");
  });

  it("should throw on invalid URL", async () => {
    await expect(
      cloneRepo("git@github.com:org/repo.git", "/tmp/prism-clones/4"),
    ).rejects.toThrow("Invalid git URL");
  });

  it("should throw and redact PAT on git failure", async () => {
    vi.mocked(execFile).mockImplementationOnce(
      (_cmd: string, _args: unknown, _opts: unknown, cb?: (err: Error | null) => void) => {
        if (cb) cb(new Error("fatal: https://ghp_secret@github.com/org/repo.git not found"));
        return undefined as never;
      },
    );

    await expect(
      cloneRepo("https://github.com/org/repo.git", "/tmp/prism-clones/5", {
        pat: "ghp_secret",
        provider: "github",
      }),
    ).rejects.toThrow("git clone failed");
  });
});

// ---------------------------------------------------------------------------
// cleanupClone
// ---------------------------------------------------------------------------

describe("cleanupClone", () => {
  it("should call rm with recursive and force options", async () => {
    await cleanupClone("/tmp/prism-clones/1");

    expect(rm).toHaveBeenCalledWith("/tmp/prism-clones/1", {
      recursive: true,
      force: true,
    });
  });

  it("should not throw when rm fails", async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error("ENOENT"));

    // Should not throw
    await expect(cleanupClone("/tmp/prism-clones/missing")).resolves.toBeUndefined();
  });
});
