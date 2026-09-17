function distinctApproveUsers(approvals) {
  const ids = [];
  for (const approval of approvals || []) {
    if (approval?.action !== "approve") continue;
    const id = String(approval?.approver_user_id || "").trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function approvalProgress(requiredApprovals, approvals) {
  const required = Math.max(1, Math.min(2, Math.trunc(Number(requiredApprovals) || 1)));
  const count = Math.min(required, distinctApproveUsers(approvals).length);
  return { count, required, status: count >= required ? "approved" : "pending" };
}

export function canUserApprove({ requiredApprovals, approvals, userId, creatorId }) {
  const normalizedUser = String(userId || "").trim();
  const normalizedCreator = String(creatorId || "").trim();
  if (!normalizedUser) return { ok: false, reason: "missing_user" };

  const approvedUsers = distinctApproveUsers(approvals);
  const required = Math.max(1, Math.min(2, Math.trunc(Number(requiredApprovals) || 1)));
  if (approvedUsers.includes(normalizedUser)) return { ok: false, reason: "duplicate_approver" };
  if (approvedUsers.length >= required) return { ok: false, reason: "already_complete" };
  if (required === 2 && approvedUsers.length === 1 && normalizedCreator && normalizedUser === normalizedCreator) {
    return { ok: false, reason: "creator_cannot_be_second" };
  }
  return { ok: true, reason: null };
}
