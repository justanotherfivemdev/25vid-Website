/**
 * Centralized navigation configuration for the 25th ID Member Hub sidebar.
 *
 * Each group contains items that are conditionally rendered based on the
 * authenticated user's role & permissions.  The `show` callback receives
 * the user object and permission helpers so visibility logic lives here
 * instead of scattered across components.
 */

import {
  LayoutDashboard,
  User,
  Users,
  MessageSquare,
  MapPin,
  Globe,
  Megaphone,
  Image,
  Calendar,
  Handshake,
  Shield,
  BookOpen,
  Map,
} from 'lucide-react';

import { isStaff } from '@/utils/permissions';

/**
 * Navigation groups for the member sidebar.
 *
 * Each item:
 *   path   – React Router path
 *   label  – Display text
 *   icon   – Lucide icon component
 *   show   – (user) => boolean  (default: always visible)
 *   exact  – only highlight when path matches exactly (default: false)
 */
export const MEMBER_NAV_GROUPS = [
  {
    id: 'hub',
    label: 'HUB',
    defaultOpen: true,
    items: [
      { path: '/hub', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { path: '/hub/profile', label: 'Profile', icon: User },
      { path: '/roster', label: 'Roster', icon: Users },
    ],
  },
  {
    id: 'operations',
    label: 'OPERATIONS',
    defaultOpen: true,
    items: [
      { path: '/hub/discussions', label: 'Discussions', icon: MessageSquare },
      { path: '/hub/campaign', label: 'Campaigns', icon: MapPin },
      { path: '/hub/operations-planner', label: 'Operations Planner', icon: Map },
      { path: '/hub/threat-map', label: 'Global Threat Map', icon: Globe },
    ],
  },
  {
    id: 'intelligence',
    label: 'INTELLIGENCE',
    defaultOpen: false,
    items: [
      { path: '/hub/intel', label: 'Intel Board', icon: Megaphone },
    ],
  },
  {
    id: 'resources',
    label: 'RESOURCES',
    defaultOpen: false,
    items: [
      { path: '/hub/gallery', label: 'Gallery', icon: Image },
      { path: '/hub/loa', label: 'Leave of Absence', icon: Calendar },
      { path: '/hub/shared', label: 'Shared Coordination', icon: Handshake },
    ],
  },
  {
    id: 'training',
    label: 'TRAINING',
    defaultOpen: false,
    items: [
      { path: '/hub', label: 'Training Programs', icon: BookOpen, hash: '#training', exact: true },
    ],
  },
  {
    id: 'administration',
    label: 'ADMINISTRATION',
    defaultOpen: false,
    items: [
      {
        path: '/admin',
        label: 'Command Center',
        icon: Shield,
        show: (user) => isStaff(user?.role),
      },
    ],
  },
];
