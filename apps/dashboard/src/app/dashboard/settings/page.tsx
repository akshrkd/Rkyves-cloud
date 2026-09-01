"use client";

import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { ConfirmButton } from "@/components/confirm-dialog";
import { useOrg } from "@/components/org-provider";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/loading-skeleton";
import { ErrorState } from "@/components/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiKey, OrgMember, User } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

type OrgDetail = {
  id: string;
  name: string;
  slug: string;
  role: string;
  members: OrgMember[];
};

export default function SettingsPage() {
  const { selectedOrg, orgs } = useOrg();
  const queryClient = useQueryClient();
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const breadcrumbs = useMemo(
    () => [{ label: "Home", href: "/dashboard" }, { label: "Settings" }],
    []
  );

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: () => api<{ user: User; organizations: typeof orgs }>("/auth/me"),
  });

  const { data: apiKeys = [], refetch: refetchKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api<ApiKey[]>("/auth/api-keys"),
  });

  const {
    data: orgDetail,
    isLoading: orgLoading,
    error: orgError,
    refetch: refetchOrg,
  } = useQuery({
    queryKey: ["org-detail", selectedOrg],
    queryFn: () => api<OrgDetail>(`/orgs/${selectedOrg}`),
    enabled: Boolean(selectedOrg),
  });

  const canManageTeam = orgDetail?.role === "owner" || orgDetail?.role === "admin";
  const user = me?.user;

  async function createApiKey(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api<{ id: string; name: string; prefix: string; key: string }>(
        "/auth/api-keys",
        { method: "POST", body: JSON.stringify({ name: newKeyName }) }
      );
      setCreatedKey(res.key);
      setNewKeyName("");
      await refetchKeys();
      toast.success("API key created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  async function deleteApiKey(id: string) {
    try {
      await api(`/auth/api-keys/${id}`, { method: "DELETE" });
      await refetchKeys();
      toast.success("API key revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke key");
    }
  }

  async function inviteMember(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    try {
      await api(`/orgs/${selectedOrg}/members`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteOpen(false);
      setInviteEmail("");
      await queryClient.invalidateQueries({ queryKey: ["org-detail", selectedOrg] });
      toast.success("Member invited");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite member");
    } finally {
      setInviting(false);
    }
  }

  async function updateMemberRole(userId: string, role: string) {
    try {
      await api(`/orgs/${selectedOrg}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await queryClient.invalidateQueries({ queryKey: ["org-detail", selectedOrg] });
      toast.success("Role updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function removeMember(userId: string) {
    try {
      await api(`/orgs/${selectedOrg}/members/${userId}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["org-detail", selectedOrg] });
      toast.success("Member removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  if (meLoading) {
    return (
      <>
        <SetBreadcrumbs items={breadcrumbs} />
        <PageSkeleton />
      </>
    );
  }

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <PageHeader title="Settings" description="Manage your profile, API access, team, and organization" />

      <Tabs defaultValue="profile" className="max-w-2xl">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your profile</CardTitle>
              <CardDescription>Account information from your Rkyves Cloud login</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-muted-foreground">Name</Label>
                <p className="font-medium">{user?.name ?? "—"}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Email</Label>
                <p className="font-medium">{user?.email}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">API Keys</CardTitle>
                <CardDescription>
                  Use API keys as Bearer tokens for CLI tools and automation. Keys are tied to your user account.
                </CardDescription>
              </div>
              <Button size="sm" onClick={() => setKeyDialogOpen(true)}>
                Create key
              </Button>
            </CardHeader>
            <CardContent>
              {apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No API keys yet.</p>
              ) : (
                <ul className="space-y-3">
                  {apiKeys.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">{k.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{k.prefix}••••••••</p>
                        <p className="text-xs text-muted-foreground">
                          Created {formatRelativeTime(k.createdAt)}
                          {k.lastUsedAt && ` · Last used ${formatRelativeTime(k.lastUsedAt)}`}
                        </p>
                      </div>
                      <ConfirmButton
                        label="Revoke"
                        title="Revoke API key?"
                        description="This key will stop working immediately. Any scripts using it will fail."
                        confirmLabel="Revoke"
                        onConfirm={() => deleteApiKey(k.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">Team members</CardTitle>
                <CardDescription>
                  Manage who has access to the selected organization. Use the org switcher in the header to change org.
                </CardDescription>
              </div>
              {canManageTeam && (
                <Button size="sm" onClick={() => setInviteOpen(true)} disabled={!selectedOrg}>
                  Invite member
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {orgLoading ? (
                <p className="text-sm text-muted-foreground">Loading team...</p>
              ) : orgError ? (
                <ErrorState
                  message={orgError instanceof Error ? orgError.message : "Failed to load team"}
                  onRetry={() => refetchOrg()}
                />
              ) : !orgDetail?.members.length ? (
                <p className="text-sm text-muted-foreground">No members found.</p>
              ) : (
                <ul className="space-y-3">
                  {orgDetail.members.map((m) => (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                    >
                      <div>
                        <p className="font-medium">{m.user.name ?? m.user.email}</p>
                        <p className="text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {canManageTeam && m.role !== "owner" ? (
                          <Select value={m.role} onValueChange={(role) => updateMemberRole(m.user.id, role)}>
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Member</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary" className="capitalize">
                            {m.role}
                          </Badge>
                        )}
                        {canManageTeam && m.role !== "owner" && m.user.id !== user?.id && (
                          <ConfirmButton
                            label="Remove"
                            title="Remove member?"
                            description={`${m.user.email} will lose access to this organization.`}
                            onConfirm={() => removeMember(m.user.id)}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {!canManageTeam && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Only admins and owners can invite or manage members.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organizations</CardTitle>
              <CardDescription>Organizations you belong to and your role in each</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {orgs.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted-foreground">{o.slug}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {o.role}
                  </Badge>
                </div>
              ))}
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/dashboard/settings/integrations">Manage GitHub integration</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog
        open={keyDialogOpen}
        onOpenChange={(o) => {
          setKeyDialogOpen(o);
          if (!o) setCreatedKey(null);
        }}
      >
        <DialogContent>
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>API key created</DialogTitle>
                <DialogDescription>Copy this key now — it won&apos;t be shown again.</DialogDescription>
              </DialogHeader>
              <Alert variant="warning">
                <AlertDescription className="break-all font-mono text-sm">{createdKey}</AlertDescription>
              </Alert>
              <DialogFooter>
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(createdKey);
                    toast.success("Copied to clipboard");
                  }}
                >
                  Copy key
                </Button>
                <Button variant="outline" onClick={() => setKeyDialogOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={createApiKey}>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>Give your key a name to identify it later.</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="key-name">Key name</Label>
                <Input
                  id="key-name"
                  className="mt-2"
                  placeholder="CI deploy key"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setKeyDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <form onSubmit={inviteMember}>
            <DialogHeader>
              <DialogTitle>Invite team member</DialogTitle>
              <DialogDescription>
                The user must already have a Rkyves Cloud account with this email address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? "Inviting..." : "Invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
