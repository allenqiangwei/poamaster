/**
 * POA Master Design System — Luminous Tech
 *
 * Aesthetic: Bright, colorful, high-tech dashboard
 * - Clean white/off-white surfaces with vivid multi-hue accents
 * - Electric blue → violet gradient as primary interactive color
 * - Each module has a signature color: teal, amber, rose, emerald, violet
 * - Colored soft shadows for depth instead of dark glassmorphism
 * - Geometric precision with warm, approachable energy
 */

import { createTheme, alpha } from '@mui/material/styles';

// ─── Core Palette ───────────────────────────────────────────
const palette = {
  // Backgrounds
  bg: {
    deep: '#f1f5f9',      // Slightly tinted for visual depth
    base: '#f8fafc',       // Main page background
    elevated: '#ffffff',   // Cards, papers, surfaces
    surface: '#ffffff',
    hover: '#f1f5f9',
  },
  // Text
  text: {
    primary: '#0f172a',    // Deep navy — maximum readability
    secondary: '#475569',  // Warm slate
    muted: '#94a3b8',      // Soft gray
    inverse: '#ffffff',
  },
  // Brand accent — electric blue → violet spectrum
  accent: {
    main: '#3b82f6',       // Electric blue
    light: '#60a5fa',
    dark: '#2563eb',
    subtle: 'rgba(59, 130, 246, 0.06)',
    border: 'rgba(59, 130, 246, 0.2)',
  },
  // Semantic colors — vivid and saturated
  success: { main: '#10b981', dark: '#059669', subtle: 'rgba(16, 185, 129, 0.08)' },
  warning: { main: '#f59e0b', dark: '#d97706', subtle: 'rgba(245, 158, 11, 0.08)' },
  danger:  { main: '#ef4444', dark: '#dc2626', subtle: 'rgba(239, 68, 68, 0.08)' },
  purple:  { main: '#8b5cf6', dark: '#7c3aed', subtle: 'rgba(139, 92, 246, 0.08)' },
  teal:    { main: '#06b6d4', dark: '#0891b2', subtle: 'rgba(6, 182, 212, 0.08)' },
  rose:    { main: '#f43f5e', dark: '#e11d48', subtle: 'rgba(244, 63, 94, 0.08)' },
  // Borders & surfaces
  border: {
    subtle: 'rgba(15, 23, 42, 0.04)',
    default: 'rgba(15, 23, 42, 0.08)',
    strong: 'rgba(15, 23, 42, 0.12)',
    focus: 'rgba(59, 130, 246, 0.4)',
  },
};

export { palette as designTokens };

// ─── MUI Theme ──────────────────────────────────────────────
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: palette.accent.main,
      light: palette.accent.light,
      dark: palette.accent.dark,
    },
    secondary: {
      main: palette.purple.main,
    },
    success: {
      main: palette.success.main,
      dark: palette.success.dark,
    },
    warning: {
      main: palette.warning.main,
      dark: palette.warning.dark,
    },
    error: {
      main: palette.danger.main,
      dark: palette.danger.dark,
    },
    background: {
      default: palette.bg.base,
      paper: palette.bg.elevated,
    },
    text: {
      primary: palette.text.primary,
      secondary: palette.text.secondary,
    },
    divider: palette.border.default,
  },
  typography: {
    fontFamily: 'var(--font-plus-jakarta), var(--font-noto-sans-sc), -apple-system, BlinkMacSystemFont, sans-serif',
    h1: { fontWeight: 800, letterSpacing: '-0.025em' },
    h2: { fontWeight: 800, letterSpacing: '-0.025em' },
    h3: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
      fontSize: '1.5rem',
      '@media (min-width:600px)': { fontSize: '1.75rem' },
      '@media (min-width:900px)': { fontSize: '2rem' },
    },
    h4: {
      fontWeight: 700,
      letterSpacing: '-0.015em',
      fontSize: '1.25rem',
      '@media (min-width:600px)': { fontSize: '1.5rem' },
      '@media (min-width:900px)': { fontSize: '1.75rem' },
    },
    h5: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
      fontSize: '1.1rem',
      '@media (min-width:600px)': { fontSize: '1.25rem' },
      '@media (min-width:900px)': { fontSize: '1.5rem' },
    },
    h6: {
      fontWeight: 600,
      letterSpacing: '-0.01em',
      fontSize: '1rem',
      '@media (min-width:600px)': { fontSize: '1.1rem' },
      '@media (min-width:900px)': { fontSize: '1.25rem' },
    },
    subtitle1: { fontWeight: 600, letterSpacing: '0.005em' },
    subtitle2: { fontWeight: 600, letterSpacing: '0.005em' },
    body1: { letterSpacing: '0.005em', lineHeight: 1.7 },
    body2: { letterSpacing: '0.005em', lineHeight: 1.6 },
    caption: { letterSpacing: '0.02em', color: palette.text.muted },
    overline: { letterSpacing: '0.1em', fontWeight: 700 },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background: palette.bg.base,
          minHeight: '100vh',
        },
        // Scrollbar styling — thin and subtle
        '*::-webkit-scrollbar': {
          width: 6,
          height: 6,
        },
        '*::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '*::-webkit-scrollbar-thumb': {
          background: palette.border.strong,
          borderRadius: 3,
        },
        '*::-webkit-scrollbar-thumb:hover': {
          background: palette.text.muted,
        },
      },
    },
    MuiPaper: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: palette.bg.elevated,
          border: `1px solid ${palette.border.default}`,
          boxShadow: `0 1px 3px ${alpha('#0f172a', 0.04)}, 0 1px 2px ${alpha('#0f172a', 0.02)}`,
        },
      },
    },
    MuiCard: {
      defaultProps: {
        elevation: 0,
      },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: palette.bg.elevated,
          border: `1px solid ${palette.border.default}`,
          boxShadow: `0 1px 3px ${alpha('#0f172a', 0.04)}, 0 1px 2px ${alpha('#0f172a', 0.02)}`,
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            borderColor: palette.border.strong,
            boxShadow: `0 4px 16px ${alpha('#0f172a', 0.08)}, 0 2px 6px ${alpha('#0f172a', 0.04)}`,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          padding: '8px 20px',
          '@media (pointer: coarse)': {
            minHeight: 44,
          },
        },
        contained: {
          background: `linear-gradient(135deg, ${palette.accent.main} 0%, ${palette.purple.main} 100%)`,
          color: '#ffffff',
          boxShadow: `0 2px 12px ${alpha(palette.accent.main, 0.25)}`,
          '&:hover': {
            background: `linear-gradient(135deg, ${palette.accent.dark} 0%, ${palette.purple.dark} 100%)`,
            boxShadow: `0 4px 20px ${alpha(palette.accent.main, 0.35)}`,
          },
        },
        outlined: {
          borderColor: palette.border.strong,
          color: palette.text.secondary,
          '&:hover': {
            borderColor: palette.accent.main,
            color: palette.accent.dark,
            backgroundColor: palette.accent.subtle,
          },
        },
        text: {
          color: palette.text.secondary,
          '&:hover': {
            backgroundColor: alpha(palette.text.secondary, 0.06),
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: palette.text.secondary,
          '&:hover': {
            backgroundColor: alpha(palette.text.secondary, 0.06),
          },
          '@media (pointer: coarse)': {
            minWidth: 44,
            minHeight: 44,
          },
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: palette.bg.elevated,
            '& fieldset': {
              borderColor: palette.border.default,
            },
            '&:hover fieldset': {
              borderColor: palette.border.strong,
            },
            '&.Mui-focused fieldset': {
              borderColor: palette.accent.main,
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: palette.bg.elevated,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.border.default,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.border.strong,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.accent.main,
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: `1px solid ${palette.border.default}`,
          backgroundColor: palette.bg.elevated,
          boxShadow: `0 1px 3px ${alpha('#0f172a', 0.04)}`,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            backgroundColor: palette.bg.deep,
            color: palette.text.muted,
            fontWeight: 600,
            fontSize: '0.75rem',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            borderBottom: `1px solid ${palette.border.default}`,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `1px solid ${palette.border.subtle}`,
          color: palette.text.secondary,
          padding: '12px 16px',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: `${palette.accent.subtle} !important`,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
          borderRadius: 8,
        },
        outlined: {
          borderColor: palette.border.strong,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.bg.elevated,
          border: `1px solid ${palette.border.default}`,
          backgroundImage: 'none',
          borderRadius: 16,
          boxShadow: `0 24px 48px ${alpha('#0f172a', 0.12)}, 0 8px 16px ${alpha('#0f172a', 0.06)}`,
          '@media (max-width: 599px)': {
            margin: 8,
            width: 'calc(100% - 16px)',
            maxHeight: 'calc(100% - 16px)',
            borderRadius: 12,
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontWeight: 700,
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
        standardError: {
          backgroundColor: palette.danger.subtle,
          color: palette.danger.dark,
          border: `1px solid ${alpha(palette.danger.main, 0.15)}`,
        },
        standardSuccess: {
          backgroundColor: palette.success.subtle,
          color: palette.success.dark,
          border: `1px solid ${alpha(palette.success.main, 0.15)}`,
        },
        standardWarning: {
          backgroundColor: palette.warning.subtle,
          color: palette.warning.dark,
          border: `1px solid ${alpha(palette.warning.main, 0.15)}`,
        },
        standardInfo: {
          backgroundColor: palette.accent.subtle,
          color: palette.accent.dark,
          border: `1px solid ${alpha(palette.accent.main, 0.15)}`,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          '& .MuiTabs-indicator': {
            backgroundColor: palette.accent.main,
            height: 3,
            borderRadius: '3px 3px 0 0',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          color: palette.text.muted,
          '&.Mui-selected': {
            color: palette.accent.dark,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#ffffff', 0.85),
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${palette.border.default}`,
          boxShadow: `0 1px 3px ${alpha('#0f172a', 0.04)}`,
          color: palette.text.primary,
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: {
          padding: 0,
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: palette.accent.subtle,
          },
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(palette.accent.main, 0.1),
          color: palette.accent.dark,
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: palette.border.subtle,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: alpha(palette.text.muted, 0.08),
        },
        bar: {
          borderRadius: 4,
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: palette.bg.elevated,
          border: `1px solid ${palette.border.default}`,
          '&:before': { display: 'none' },
          borderRadius: '12px !important',
          overflow: 'hidden',
          boxShadow: `0 1px 3px ${alpha('#0f172a', 0.04)}`,
          '&.Mui-expanded': {
            margin: '0 0 8px 0',
          },
        },
      },
    },
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': {
            color: palette.text.secondary,
            borderColor: palette.border.default,
            '&.Mui-selected': {
              backgroundColor: palette.accent.main,
              color: palette.text.inverse,
              '&:hover': {
                backgroundColor: palette.accent.dark,
              },
            },
          },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.bg.elevated,
          border: `1px solid ${palette.border.default}`,
          boxShadow: `0 8px 24px ${alpha('#0f172a', 0.08)}`,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.bg.elevated,
          border: `1px solid ${palette.border.default}`,
          backgroundImage: 'none',
          boxShadow: `0 8px 24px ${alpha('#0f172a', 0.08)}`,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: palette.accent.subtle,
          },
          '&.Mui-selected': {
            backgroundColor: alpha(palette.accent.main, 0.08),
            '&:hover': {
              backgroundColor: alpha(palette.accent.main, 0.12),
            },
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          color: palette.text.secondary,
          borderColor: palette.border.default,
          textTransform: 'none',
          '&.Mui-selected': {
            backgroundColor: alpha(palette.accent.main, 0.1),
            color: palette.accent.dark,
            borderColor: palette.accent.main,
            '&:hover': {
              backgroundColor: alpha(palette.accent.main, 0.15),
            },
          },
        },
      },
    },
    MuiSnackbar: {
      defaultProps: {
        anchorOrigin: { vertical: 'top', horizontal: 'center' },
      },
    },
  },
});
