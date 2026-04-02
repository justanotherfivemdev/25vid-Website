/**
 * Centralized role & permission definitions for the 25th ID Command Center.
 *
 * Mirrors the backend RBAC (middleware/rbac.py).  Every sidebar item, route
 * guard, and UI visibility check should reference this module so that adding
 * a new role or permission is a single-file change on the frontend.
 */

// ── Role identifiers ────────────────────────────────────────────────────────

export const ROLES = {
  ADMIN: 'admin',
  S1_PERSONNEL: 's1_personnel',
  S2_INTELLIGENCE: 's2_intelligence',
  S3_OPERATIONS: 's3_operations',
  S4_LOGISTICS: 's4_logistics',
  S5_CIVIL_AFFAIRS: 's5_civil_affairs',
  S6_COMMUNICATIONS: 's6_communications',
  TRAINING_STAFF: 'training_staff',
  S5_LIAISON: 's5_liaison', // legacy alias → treated as S5
  MEMBER: 'member',
  PARTNER: 'partner',
  GUEST: 'guest',
  PARTNER_ADMIN: 'partner_admin',
  RECRUIT: 'recruit',
};

// ── Permission identifiers ──────────────────────────────────────────────────

export const PERMISSIONS = {
  MANAGE_USERS: 'manage_users',
  VIEW_MEMBERS: 'view_members',
  EDIT_MEMBER_TRAINING_FIELDS: 'edit_member_training_fields',
  MANAGE_RECRUITMENT: 'manage_recruitment',
  MANAGE_LOA: 'manage_loa',
  MANAGE_OPERATIONS: 'manage_operations',
  MANAGE_CAMPAIGNS: 'manage_campaigns',
  MANAGE_DEPLOYMENTS: 'manage_deployments',
  MANAGE_INTEL: 'manage_intel',
  VIEW_INTEL: 'view_intel',
  MANAGE_CONTENT: 'manage_content',
  MANAGE_ANNOUNCEMENTS: 'manage_announcements',
  MANAGE_GALLERY: 'manage_gallery',
  MANAGE_TRAINING: 'manage_training',
  MANAGE_PARTNERS: 'manage_partners',
  MANAGE_PLANS: 'manage_plans',
  MANAGE_SERVERS: 'manage_servers',
  VIEW_ROSTER: 'view_roster',
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_LOGS: 'view_logs',
  FULL_ACCESS: 'full_access',
};

const ALL_PERMISSIONS = new Set(Object.values(PERMISSIONS));

// ── Role → Permission mapping ───────────────────────────────────────────────

const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ALL_PERMISSIONS,
  [ROLES.S1_PERSONNEL]: ALL_PERMISSIONS,

  [ROLES.S2_INTELLIGENCE]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_INTEL,
    PERMISSIONS.VIEW_INTEL,
    PERMISSIONS.VIEW_ROSTER,
  ]),

  [ROLES.S3_OPERATIONS]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_OPERATIONS,
    PERMISSIONS.MANAGE_CAMPAIGNS,
    PERMISSIONS.MANAGE_DEPLOYMENTS,
    PERMISSIONS.MANAGE_TRAINING,
    PERMISSIONS.MANAGE_PLANS,
    PERMISSIONS.VIEW_ROSTER,
    PERMISSIONS.VIEW_INTEL,
  ]),

  [ROLES.S4_LOGISTICS]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_DEPLOYMENTS,
    PERMISSIONS.MANAGE_SERVERS,
    PERMISSIONS.VIEW_ROSTER,
    PERMISSIONS.VIEW_INTEL,
  ]),

  [ROLES.S5_CIVIL_AFFAIRS]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_PARTNERS,
    PERMISSIONS.VIEW_ROSTER,
    PERMISSIONS.VIEW_INTEL,
  ]),

  [ROLES.S6_COMMUNICATIONS]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_CONTENT,
    PERMISSIONS.MANAGE_ANNOUNCEMENTS,
    PERMISSIONS.MANAGE_GALLERY,
    PERMISSIONS.VIEW_ROSTER,
    PERMISSIONS.VIEW_INTEL,
  ]),

  [ROLES.TRAINING_STAFF]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_TRAINING,
    PERMISSIONS.VIEW_MEMBERS,
    PERMISSIONS.EDIT_MEMBER_TRAINING_FIELDS,
    PERMISSIONS.MANAGE_RECRUITMENT,
    PERMISSIONS.VIEW_ROSTER,
  ]),

  // Legacy alias
  [ROLES.S5_LIAISON]: new Set([
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_PARTNERS,
    PERMISSIONS.VIEW_ROSTER,
    PERMISSIONS.VIEW_INTEL,
  ]),

  [ROLES.MEMBER]: new Set([PERMISSIONS.VIEW_ROSTER, PERMISSIONS.VIEW_INTEL]),
  [ROLES.PARTNER]: new Set(),
  [ROLES.PARTNER_ADMIN]: new Set(),
  [ROLES.GUEST]: new Set(),
  [ROLES.RECRUIT]: new Set(),
};

// ── Helper functions ────────────────────────────────────────────────────────

/**
 * Check whether a role grants a specific permission.
 */
export function hasPermission(role, permission) {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.has(permission) : false;
}

/**
 * Check whether a role grants ANY of the listed permissions.
 */
export function hasAnyPermission(role, ...permissions) {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Set of all roles that may access the Command Center (admin panel).
 */
export const STAFF_ROLES = new Set([
  ROLES.ADMIN,
  ROLES.S1_PERSONNEL,
  ROLES.S2_INTELLIGENCE,
  ROLES.S3_OPERATIONS,
  ROLES.S4_LOGISTICS,
  ROLES.S5_CIVIL_AFFAIRS,
  ROLES.S6_COMMUNICATIONS,
  ROLES.TRAINING_STAFF,
  ROLES.S5_LIAISON,
]);

export function isStaff(role) {
  return STAFF_ROLES.has(role);
}

// ── Human-readable role labels ──────────────────────────────────────────────

export const ROLE_LABELS = {
  [ROLES.ADMIN]: 'Admin (S-1)',
  [ROLES.S1_PERSONNEL]: 'S-1 Personnel',
  [ROLES.S2_INTELLIGENCE]: 'S-2 Intelligence',
  [ROLES.S3_OPERATIONS]: 'S-3 Operations',
  [ROLES.S4_LOGISTICS]: 'S-4 Logistics',
  [ROLES.S5_CIVIL_AFFAIRS]: 'S-5 Civil Affairs',
  [ROLES.S6_COMMUNICATIONS]: 'S-6 Communications',
  [ROLES.TRAINING_STAFF]: 'Training Staff',
  [ROLES.S5_LIAISON]: 'S-5 Liaison (Legacy)',
  [ROLES.MEMBER]: 'Member',
  [ROLES.RECRUIT]: 'Recruit',
};

/** Roles selectable when assigning a role to a 25th ID member. */
export const ASSIGNABLE_ROLES = [
  ROLES.MEMBER,
  ROLES.ADMIN,
  ROLES.S1_PERSONNEL,
  ROLES.S2_INTELLIGENCE,
  ROLES.S3_OPERATIONS,
  ROLES.S4_LOGISTICS,
  ROLES.S5_CIVIL_AFFAIRS,
  ROLES.S6_COMMUNICATIONS,
  ROLES.TRAINING_STAFF,
];

// ── Command Center title per role ───────────────────────────────────────────

export function getCommandCenterTitle(role) {
  const titles = {
    [ROLES.ADMIN]: '25TH ID COMMAND CENTER',
    [ROLES.S1_PERSONNEL]: 'S-1 COMMAND CENTER',
    [ROLES.S2_INTELLIGENCE]: 'S-2 INTEL CENTER',
    [ROLES.S3_OPERATIONS]: 'S-3 OPS CENTER',
    [ROLES.S4_LOGISTICS]: 'S-4 LOGISTICS',
    [ROLES.S5_CIVIL_AFFAIRS]: 'S-5 CIVIL AFFAIRS',
    [ROLES.S6_COMMUNICATIONS]: 'S-6 COMMS CENTER',
    [ROLES.TRAINING_STAFF]: 'TRAINING CENTER',
    [ROLES.S5_LIAISON]: 'S-5 LIAISON CENTER',
  };
  return titles[role] || '25TH ID COMMAND CENTER';
}

export function getCommandCenterTitleShort(role) {
  const titles = {
    [ROLES.ADMIN]: '25TH ID',
    [ROLES.S1_PERSONNEL]: 'S-1',
    [ROLES.S2_INTELLIGENCE]: 'S-2',
    [ROLES.S3_OPERATIONS]: 'S-3',
    [ROLES.S4_LOGISTICS]: 'S-4',
    [ROLES.S5_CIVIL_AFFAIRS]: 'S-5',
    [ROLES.S6_COMMUNICATIONS]: 'S-6',
    [ROLES.TRAINING_STAFF]: 'TRNG',
    [ROLES.S5_LIAISON]: 'S-5',
  };
  return titles[role] || '25TH ID';
}
