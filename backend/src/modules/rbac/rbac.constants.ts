export enum ScopeType {
  GLOBAL = 'GLOBAL',
  SOCIETY = 'SOCIETY',
  UNIT = 'UNIT',
  GATE = 'GATE',
}

export const ROLE_GRANTS: Record<string, string[]> = {
  OWNER: [
    'approval.decide@UNIT',
    'staff.assign@UNIT',
    'passcode.create@UNIT',
    'delivery_perm.edit@UNIT',
    'entry.view@UNIT',
    'member.invite@UNIT',
    'complaint.create@UNIT',
  ],
  TENANT: [
    'approval.decide@UNIT',
    'staff.assign@UNIT',
    'passcode.create@UNIT',
    'delivery_perm.edit@UNIT',
    'entry.view@UNIT',
    'complaint.create@UNIT',
  ],
  FAMILY: [
    'approval.decide@UNIT',
    'passcode.create@UNIT',
    'entry.view@UNIT',
  ],
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
    'device.manage@SOCIETY',
    'notice.post@SOCIETY',
    'entry.view@SOCIETY',
    'complaint.manage@SOCIETY',
  ],
};
