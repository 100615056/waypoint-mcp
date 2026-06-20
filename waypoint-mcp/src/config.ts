import { readFile } from "fs/promises";
import { join } from "path";

export interface WaypointConfig {
  requiredBeforePR?: string[];
  reviewCriteria?: string[];
  artifactRetention?: "keep" | "archive" | "delete";
  customTools?: Record<string, { description: string; enabled: boolean }>;
}

const DEFAULTS: WaypointConfig = {
  requiredBeforePR: [],
  reviewCriteria: [],
  artifactRetention: "keep",
};

export async function loadConfig(workspacePath: string): Promise<WaypointConfig> {
  try {
    const raw = await readFile(join(workspacePath, "waypoint.config.json"), "utf8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}
