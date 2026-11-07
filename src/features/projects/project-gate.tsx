"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, use, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { AccessBanner, AccessBannerAction, pickAccessBanner } from "@/components/feedback/access-banner";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ProjectCapabilities, ProjectSummary } from "@/data/project-domain";
import {
  useAcceptInvitation,
  useClearProjectScope,
  useDeclineInvitation,
  useMyInvitations,
  useProjectAccess,
  useRestoreProject,
} from "@/data/project-queries";
import { projectHref } from "@/features/navigation/contexts";
import { getProjectIdFromPathname } from "@/features/navigation/paths";
import { demoAccessOptions, parseProjectDemoState, setProjectDemoState, type ProjectDemoState } from "./demo-state";
import { DemoStateSwitch } from "./demo-state-switch";
import { useProjectFormat } from "./format";
import { useProjectLabels } from "./labels";

/*
 * Every /projects/[id]/… route renders inside this gate (SH-02). It loads the
 * project's access answer (capabilities included) and shows the full-page
 * states — loading, error, unauthenticated, not available (forbidden = not
 * found), invite pending, revoked, deleted — or provides the project to the
 * page, which places <ProjectBanner/> under its header (offline › archived ›
 * conflict › read-only › guest, one at a time).
 *
 * Mock mode: `?state=<id>` forces any SH-02 state (demo-state switch).
 */

interface ProjectContextValue {
  project: ProjectSummary;
  capabilities: ProjectCapabilities;
  /** The forced demo state, or null on real data. */
  demo: ProjectDemoState | null;
  refetch: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function useProject(): ProjectContextValue {
  const value = use(ProjectContext);
  if (!value) throw new Error("useProject must be used inside <ProjectGate>");
  return value;
}

/** Tests and previews: provide a project without the gate. */
export const ProjectContextProvider = ProjectContext.Provider;

function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

const DEMO_ERROR_REF = "7F3A-21";

export function ProjectGate({ children }: { children: ReactNode }) {
  const t = useTranslations("Access.states");
  const labels = useProjectLabels();
  const router = useRouter();
  const pathname = usePathname();
  const id = getProjectIdFromPathname(pathname);
  const demo = parseProjectDemoState(useSearchParams().get("state"));
  const access = useProjectAccess(id, demoAccessOptions(demo));
  const invitations = useMyInvitations();
  const accept = useAcceptInvitation();
  const decline = useDeclineInvitation();
  const clearScope = useClearProjectScope();
  const answer = access.data;

  // Shell islands (rail, Quick create) follow the forced state.
  useEffect(() => {
    setProjectDemoState(demo);
    return () => setProjectDemoState(null);
  }, [demo]);

  const revoked = demo === "revoked" || answer?.status === "revoked";
  // Revocation: drop everything cached for this project before showing the state.
  useEffect(() => {
    if (revoked && id) clearScope(id);
  }, [revoked, id, clearScope]);

  const myProjects = (
    <Link href="/projects" className={buttonVariants()}>
      {t("notAvailable.action")}
    </Link>
  );

  let content: ReactNode;
  if (demo === "loading" || access.isPending) {
    content = <AccessLoading onRetry={() => void access.refetch()} />;
  } else if (demo === "error" || access.isError) {
    content = (
      <AccessState
        kind="error"
        errorRef={demo === "error" ? DEMO_ERROR_REF : undefined}
        primaryAction={<Button onClick={() => void access.refetch()}>{t("error.action")}</Button>}
      />
    );
  } else if (demo === "unauthenticated") {
    content = (
      <AccessState
        kind="unauthenticated"
        primaryAction={
          <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`} className={buttonVariants()}>
            {t("unauthenticated.action")}
          </Link>
        }
      />
    );
  } else if (revoked) {
    content = <AccessState kind="revoked" primaryAction={myProjects} />;
  } else if (demo === "not-available" || answer?.status === "not-available") {
    content = <AccessState kind="not-available" primaryAction={myProjects} />;
  } else if (demo === "invite-pending" || answer?.status === "invite-pending") {
    const invitation = answer?.status === "invite-pending" ? answer.invitation : invitations.data?.[0];
    content = invitation ? (
      <AccessState
        kind="invite-pending"
        values={{
          project: invitation.projectName,
          inviter: invitation.inviter.name,
          role: labels.role(invitation.role),
        }}
        primaryAction={
          <Button
            disabled={accept.isPending}
            onClick={() =>
              accept.mutate(invitation.id, {
                onSuccess: ({ projectId }) => router.replace(projectHref(projectId)),
              })
            }
          >
            {t("invite.accept")}
          </Button>
        }
        secondaryAction={
          <Button
            variant="secondary"
            disabled={decline.isPending}
            onClick={() => decline.mutate({ id: invitation.id }, { onSuccess: () => router.replace("/projects") })}
          >
            {t("invite.decline")}
          </Button>
        }
      />
    ) : (
      <AccessState kind="not-available" primaryAction={myProjects} />
    );
  } else if (demo === "deleted" && id) {
    content = (
      <AccessState
        kind="deleted"
        primaryAction={
          <Link href={projectHref(id, "tasks")} className={buttonVariants()}>
            {t("deleted.action")}
          </Link>
        }
      />
    );
  } else if (answer?.status === "ok") {
    content = (
      <ProjectContext
        value={{
          project: answer.project,
          capabilities: answer.capabilities,
          demo,
          refetch: () => void access.refetch(),
        }}
      >
        {children}
      </ProjectContext>
    );
  } else {
    content = <AccessState kind="not-available" primaryAction={myProjects} />;
  }

  return (
    <div data-scope="project" className="flex min-w-0 flex-col gap-4">
      {content}
      <DemoStateSwitch value={demo} />
    </div>
  );
}

/**
 * The one SH-02 banner for the current project, placed directly under the
 * page header. Renders nothing when no condition holds.
 */
export function ProjectBanner({ className }: { className?: string }) {
  const { project, capabilities, demo, refetch } = useProject();
  const online = useOnline();
  const format = useProjectFormat();
  const t = useTranslations("Access.banners");
  const restore = useRestoreProject(project.id);
  const kind = pickAccessBanner({
    offline: demo === "offline" || !online,
    archived: project.lifecycle === "archived",
    conflict: demo === "conflict",
    "read-only": project.role === "viewer",
    guest: project.role === "guest",
  });
  if (!kind) return null;

  const values: Record<string, string | number> = {
    date: project.lifecycleAt ? format.day(project.lifecycleAt) : "",
    count: format.number(project.sharedTaskCount ?? 0),
    person: "Sara P.",
  };
  let action: ReactNode = null;
  if (kind === "offline") action = <AccessBannerAction onClick={refetch}>{t("retry")}</AccessBannerAction>;
  if (kind === "conflict") action = <AccessBannerAction onClick={refetch}>{t("reload")}</AccessBannerAction>;
  if (kind === "archived" && capabilities.restore) {
    action = (
      <AccessBannerAction disabled={restore.isPending} onClick={() => restore.mutate()}>
        {t("restore")}
      </AccessBannerAction>
    );
  }
  return <AccessBanner kind={kind} values={values} action={action} className={className} />;
}
