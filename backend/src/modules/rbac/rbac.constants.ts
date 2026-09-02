export enum ScopeType {
  GLOBAL = 'GLOBAL',
  SOCIETY = 'SOCIETY',
  UNIT = 'UNIT',
  GATE = 'GATE',
}

export const ROLE_GRANTS: Record<string, string[]> = {
  // NOTE: staff.assign@UNIT is intentionally NOT granted to OWNER/TENANT — assigning
  // domestic staff to a flat is a site-admin action (see staff.assign@SOCIETY below),
  // not something residents can self-serve. See mobile-resident.controller.ts (view-only)
  // and society-admin.controller.ts (assign/unassign).
  OWNER: [
    'approval.decide@UNIT',
    'passcode.create@UNIT',
    'delivery_perm.edit@UNIT',
    'entry.view@UNIT',
    'member.invite@UNIT',
    'complaint.create@UNIT',
    'complaint.view@UNIT',
    'notice.read@UNIT',
  ],
  TENANT: [
    'approval.decide@UNIT',
    'passcode.create@UNIT',
    'delivery_perm.edit@UNIT',
    'entry.view@UNIT',
    'complaint.create@UNIT',
    'complaint.view@UNIT',
    'notice.read@UNIT',
  ],
  FAMILY: [
    'approval.decide@UNIT',
    'passcode.create@UNIT',
    'entry.view@UNIT',
    'complaint.view@UNIT',
    'notice.read@UNIT',
  ],
  // directory.read is @SOCIETY, not @GATE: a directory is society-wide data — the same
  // rows behind every barrier — per gate-management-architecture.md §4.1. It used to be
  // granted @GATE here, matching a route that checked @GATE too, so the mismatch never
  // showed up as a *disagreement* — the whole path just 403'd unconditionally for every
  // guard, on every gate (see mobile-guard.controller.ts's getDirectory/getSocietyStaff).
  GUARD: [
    'entry.create@GATE',
    'photo.capture@GATE',
    'approval.request@GATE',
    'passcode.verify@GATE',
    'directory.read@SOCIETY',
    'entry.view@GATE',
  ],
  GUARD_SUPERVISOR: [
    'entry.create@GATE',
    'photo.capture@GATE',
    'approval.request@GATE',
    'passcode.verify@GATE',
    'directory.read@SOCIETY',
    'entry.view@GATE',
    'guard.roster@SOCIETY',
    'entry.view@SOCIETY',
  ],
  SOCIETY_ADMIN: [
    'unit.manage@SOCIETY',
    'member.manage@SOCIETY',
    'staff.manage@SOCIETY',
    'staff.assign@SOCIETY',
    'device.manage@SOCIETY',
    'gate.manage@SOCIETY',
    'notice.post@SOCIETY',
    'entry.view@SOCIETY',
    'complaint.manage@SOCIETY',
  ],
};
