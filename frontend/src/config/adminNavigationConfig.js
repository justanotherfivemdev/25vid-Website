/**
 * Centralized navigation configuration for the Command Center (admin) sidebar.
 *
 * Mirrors the pattern used by MEMBER_NAV_GROUPS in navigationConfig.js.
 * Each group contains items conditionally rendered based on the
 * authenticated user's role & permissions via `show` callbacks.
 */

import {
  LayoutDashboard,
  Settings,
  UserPlus,
  Users,
  FileText,
  Navigation,
  Calendar,
  MapPin,
  Megaphone,
  Image,
  Radio,
  BookOpen,
  Building2,
  Shield,
  ClipboardList,
  ScrollText,
  AlertTriangle,
  Map,
  Server,
  Package,
  Layers,
  Plus,
  Puzzle,
} from 'lucide-react';

import { hasPermission, PERMISSIONS } from '@/utils/permissions';

/**
 * Navigation groups for the admin sidebar.
 *
 * Each item:
 *   path   – React Router path
 *   label  – Display text
 *   icon   – Lucide icon component
 *   show   – (role) => boolean  (default: always visible)
 *   exact  – only highlight when path matches exactly (default: false)
 */
export const ADMIN_NAV_GROUPS = [
  {
    id: 'overview',
    label: 'OVERVIEW',
    defaultOpen: false,
    items: [
      { path: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      {
        path: '/admin/site-content',
        label: 'Site Content',
        icon: Settings,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_CONTENT),
      },
    ],
  },
  {
    id: 'personnel',
    label: 'PERSONNEL',
    defaultOpen: false,
    items: [
      {
        path: '/admin/recruitment',
        label: 'Recruitment',
        icon: UserPlus,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_RECRUITMENT),
      },
      {
        path: '/admin/pipeline',
        label: 'Recruit Pipeline',
        icon: UserPlus,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_RECRUITMENT),
      },
      {
        path: '/admin/users',
        label: 'Members',
        icon: Users,
        show: (role) =>
          hasPermission(role, PERMISSIONS.MANAGE_USERS) ||
          hasPermission(role, PERMISSIONS.VIEW_MEMBERS),
      },
      {
        path: '/admin/training',
        label: 'Training',
        icon: FileText,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_TRAINING),
      },
      {
        path: '/admin/loa',
        label: 'LOA Management',
        icon: Calendar,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_LOA),
      },
    ],
  },
  {
    id: 'operations',
    label: 'OPERATIONS',
    defaultOpen: false,
    items: [
      {
        path: '/admin/deployments',
        label: 'Deployments',
        icon: Navigation,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_DEPLOYMENTS),
      },
      {
        path: '/admin/operations',
        label: 'Operations',
        icon: Calendar,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_OPERATIONS),
      },
      {
        path: '/admin/campaigns',
        label: 'Campaigns',
        icon: MapPin,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_CAMPAIGNS),
      },
      {
        path: '/hub/operations-planner',
        label: 'Operations Planner',
        icon: Map,
        show: (role) =>
          hasPermission(role, PERMISSIONS.MANAGE_PLANS) ||
          hasPermission(role, PERMISSIONS.MANAGE_OPERATIONS),
      },
    ],
  },
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    defaultOpen: false,
    items: [
      {
        path: '/admin/intel',
        label: 'Intel & Briefings',
        icon: Radio,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_INTEL),
      },
    ],
  },
  {
    id: 'communications',
    label: 'COMMUNICATIONS',
    defaultOpen: false,
    items: [
      {
        path: '/admin/announcements',
        label: 'Announcements',
        icon: Megaphone,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_ANNOUNCEMENTS),
      },
      {
        path: '/admin/gallery',
        label: 'Gallery',
        icon: Image,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_GALLERY),
      },
      {
        path: '/admin/history',
        label: 'Unit History',
        icon: BookOpen,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_CONTENT),
      },
    ],
  },
  {
    id: 'configuration',
    label: 'CONFIGURATION',
    defaultOpen: false,
    items: [
      {
        path: '/admin/unit-config',
        label: 'Unit Config',
        icon: Building2,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_USERS),
      },
      {
        path: '/admin/partner-units',
        label: 'Partner Units',
        icon: Shield,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_PARTNERS),
      },
      {
        path: '/admin/partner-applications',
        label: 'Partner Applications',
        icon: ClipboardList,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_PARTNERS),
      },
    ],
  },
  {
    id: 'server-management',
    label: 'SERVER MANAGEMENT',
    defaultOpen: false,
    items: [
      {
        path: '/admin/servers',
        label: 'Fleet Dashboard',
        icon: Server,
        exact: true,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_SERVERS),
      },
      {
        path: '/admin/servers/create',
        label: 'Provision Server',
        icon: Plus,
        show: (role) => ['admin', 's1_personnel'].includes(role),
      },
      {
        path: '/admin/servers/workshop',
        label: 'Workshop Browser',
        icon: Package,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_SERVERS),
      },
      {
        path: '/admin/servers/presets',
        label: 'Mod Presets',
        icon: Layers,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_SERVERS),
      },
      {
        path: '/admin/servers/mod-issues',
        label: 'Mod Issues',
        icon: AlertTriangle,
        show: (role) => hasPermission(role, PERMISSIONS.MANAGE_SERVERS),
      },
    ],
  },
  {
    id: 'logs',
    label: 'SYSTEM LOGS',
    defaultOpen: false,
    items: [
      {
        path: '/admin/error-logs',
        label: 'Error Logs',
        icon: AlertTriangle,
        show: (role) => hasPermission(role, PERMISSIONS.VIEW_LOGS),
      },
      {
        path: '/admin/audit-logs',
        label: 'Audit Logs',
        icon: ScrollText,
        show: (role) => hasPermission(role, PERMISSIONS.VIEW_LOGS),
      },
    ],
  },
];
