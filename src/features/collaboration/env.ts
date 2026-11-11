export function getCollabWsUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_COLLAB_WS_URL?.trim();
  if (!value) {
    return null;
  }
  return value.replace(/\/$/, "");
}

export function isCollaborationEnabled(): boolean {
  return Boolean(getCollabWsUrl());
}
