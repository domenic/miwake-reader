import {
  faBug,
  faChartLine,
  faCog,
  faFileArrowUp,
  faFileZipper,
  faFolderPlus,
  faSignOutAlt
} from '@fortawesome/free-solid-svg-icons';

export const mergeEntries = {
  MANAGE: { routeId: '/manage', label: 'Manager', icon: faSignOutAlt, title: 'Go to Book Manager' },
  SETTINGS: {
    routeId: '/settings',
    label: 'Reader Settings',
    icon: faCog,
    title: 'Go to Reader Settings'
  },
  STATISTICS: {
    routeId: '/statistics',
    label: 'Statistics',
    icon: faChartLine,
    title: 'Go to Statistics'
  },
  BUG_REPORT: { routeId: '', label: 'Bug Report', icon: faBug, title: 'Report a bug' },
  FOLDER_IMPORT: {
    routeId: '',
    label: 'Import Folder',
    icon: faFolderPlus,
    title: 'Import from Folder'
  },
  FILE_IMPORT: { routeId: '', label: 'Import Files', icon: faFileArrowUp, title: 'Import Files' },
  BACKUP_IMPORT: { routeId: '', label: 'Import Backup', icon: faFileZipper, title: 'Import Backup' }
};
