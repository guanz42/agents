import { lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "./registry.js";

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface WriteFileOutput {
  ok: boolean;
  path: string;
  bytesWritten: number;
  error?: string;
}

export const writeFileSchema = z.object({
  path: z.string().min(1, "path is required"),
  content: z.string(),
});

function assertInsideWorkspace(workspaceRoot: string, targetPath: string): void {
  const relativePath = path.relative(workspaceRoot, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path must stay inside the workspace root");
  }
}

async function getNearestExistingRealPath(targetPath: string): Promise<string> {
  let cursor = targetPath;

  while (true) {
    try {
      return await realpath(cursor);
    } catch (error) {
      const isMissingPath =
        error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT";

      if (!isMissingPath) {
        throw error;
      }

      const parent = path.dirname(cursor);

      if (parent === cursor) {
        throw error;
      }

      cursor = parent;
    }
  }
}

async function resolveInsideWorkspace(workspaceRoot: string, targetPath: string): Promise<string> {
  const resolvedRoot = await realpath(path.resolve(workspaceRoot));
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);
  assertInsideWorkspace(resolvedRoot, resolvedTarget);

  const realAncestor = await getNearestExistingRealPath(resolvedTarget);
  assertInsideWorkspace(resolvedRoot, realAncestor);

  try {
    const targetStat = await lstat(resolvedTarget);

    if (targetStat.isSymbolicLink()) {
      const realTarget = await realpath(resolvedTarget);
      assertInsideWorkspace(resolvedRoot, realTarget);
    }
  } catch (error) {
    const isMissingPath =
      error instanceof Error && "code" in error && (error as { code?: string }).code === "ENOENT";

    if (!isMissingPath) {
      throw error;
    }
  }

  return resolvedTarget;
}

function resolveFallbackPath(workspaceRoot: string, targetPath: string): string {
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);
  const relativePath = path.relative(resolvedRoot, resolvedTarget);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Path must stay inside the workspace root");
  }

  return resolvedTarget;
}

export function createWriteFileTool(
  workspaceRoot: string,
): ToolDefinition<WriteFileInput, WriteFileOutput> {
  return {
    name: "write_file",
    description: "Write a UTF-8 file inside the workspace",
    schema: writeFileSchema,
    async execute(input: WriteFileInput): Promise<WriteFileOutput> {
      let targetPath = "";

      try {
        targetPath = resolveFallbackPath(workspaceRoot, input.path);
        targetPath = await resolveInsideWorkspace(workspaceRoot, input.path);
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, input.content, "utf8");

        return {
          ok: true,
          path: targetPath,
          bytesWritten: Buffer.byteLength(input.content, "utf8"),
        };
      } catch (error) {
        return {
          ok: false,
          path: targetPath,
          bytesWritten: 0,
          error: error instanceof Error ? error.message : "Unknown write error",
        };
      }
    },
  };
}
