import type {
  ProjectAccess,
  ProjectDirectory,
  ProjectHealth,
  ProjectInvitation,
  ProjectRole,
  ProjectSummary,
} from "./project-domain";

/*
 * Projects (Phase 2) repository interfaces. Backend Phase 2 is not built:
 * only mock adapters implement these (src/data/mock/mock-projects.ts); never
 * add an API adapter with guessed endpoints. Errors use RepositoryError.
 */

export interface ProjectAccessOptions {
  /**
   * Demo harness only (SH-02 demo-state switch): answer as if the current
   * user held this role. Mock adapters honour it; a live adapter ignores it.
   */
  previewRole?: ProjectRole;
  /** Demo harness only: answer as if the project were archived. */
  previewArchived?: boolean;
}

export interface ProjectStatusInput {
  health: ProjectHealth;
  note: string;
}

export interface ProjectRepository {
  /** Projects the user can see, server counts per filter, and the recent list. */
  listAccessible(): Promise<ProjectDirectory>;
  /** One project with the user's capabilities, or an access answer (not available / invite / revoked). */
  access(id: string, options?: ProjectAccessOptions): Promise<ProjectAccess>;
  /** Manager+: status chip + short note (D9). */
  setStatus(id: string, input: ProjectStatusInput): Promise<ProjectSummary>;
  /** Owner/Admin: archived → active. */
  restore(id: string): Promise<ProjectSummary>;
}

export interface InvitationRepository {
  /** Pending invitations for the current user (public-safe preview only). */
  listMine(): Promise<readonly ProjectInvitation[]>;
  /** Accepts and returns the project id to open. */
  accept(id: string): Promise<{ projectId: string }>;
  decline(id: string, note?: string): Promise<void>;
}

/** The Projects part of the `Repositories` aggregate (mock adapters only). */
export interface ProjectRepositories {
  projects: ProjectRepository;
  invitations: InvitationRepository;
}
