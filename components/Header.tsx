'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Tooltip,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  alpha,
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Home as HomeIcon,
  List as ListIcon,
  People as PeopleIcon,
  Assessment as PulseIcon,
  Forum as RoundtableIcon,
  Chat as FeishuIcon,
  Insights as InsightsIcon,
  MonitorHeart as MonitorHeartIcon,
  Gavel as GavelIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  TravelExplore as CompetitorIcon,
  Flag as FlagIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

const NAV_ITEMS = [
  { path: '/', label: '首页', icon: <HomeIcon fontSize="small" />, exact: true },
  { path: '/todo', label: '任务', icon: <ListIcon fontSize="small" /> },
  { path: '/decisions', label: '决策日志', icon: <GavelIcon fontSize="small" /> },
  { path: '/okr', label: 'OKR', icon: <FlagIcon fontSize="small" /> },
  { path: '/assignees', label: '团队', icon: <PeopleIcon fontSize="small" /> },
  { path: '/pulse', label: '项目', icon: <PulseIcon fontSize="small" /> },
  { path: '/roundtable', label: '圆桌', icon: <RoundtableIcon fontSize="small" /> },
  { path: '/feishu', label: '飞书', icon: <FeishuIcon fontSize="small" /> },
  { path: '/insights', label: '简报', icon: <InsightsIcon fontSize="small" /> },
  { path: '/sentiment', label: '舆情', icon: <MonitorHeartIcon fontSize="small" /> },
  { path: '/insights/competitors', label: '竞品', icon: <CompetitorIcon fontSize="small" /> },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      router.push('/login');
    }
  };

  const isActive = (item: typeof NAV_ITEMS[0]) => {
    if (item.exact) return pathname === item.path;
    return pathname?.startsWith(item.path);
  };

  const handleNavClick = (path: string) => {
    router.push(path);
    setDrawerOpen(false);
  };

  return (
    <AppBar position="sticky">
      <Toolbar sx={{ gap: 0.5 }}>
        {/* Mobile hamburger */}
        <IconButton
          onClick={() => setDrawerOpen(true)}
          sx={{
            display: { xs: 'flex', sm: 'none' },
            color: dt.text.secondary,
            mr: 1,
          }}
        >
          <MenuIcon />
        </IconButton>

        {/* Logo */}
        <Typography
          variant="h6"
          component="div"
          sx={{
            cursor: 'pointer',
            mr: { xs: 'auto', sm: 3 },
            fontWeight: 800,
            letterSpacing: '-0.02em',
            background: `linear-gradient(135deg, ${dt.accent.main} 0%, ${dt.purple.main} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
          onClick={() => router.push('/')}
        >
          POA Master
        </Typography>

        {/* Desktop/Tablet Navigation */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'flex' }, gap: 0.5 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Tooltip key={item.path} title={item.label} arrow disableHoverListener>
                <Button
                  color="inherit"
                  size="small"
                  startIcon={item.icon}
                  onClick={() => router.push(item.path)}
                  sx={{
                    px: 1.5,
                    py: 0.75,
                    color: active ? dt.accent.dark : dt.text.secondary,
                    bgcolor: active ? alpha(dt.accent.main, 0.08) : 'transparent',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    fontWeight: active ? 700 : 500,
                    transition: 'all 0.2s',
                    minWidth: 0,
                    '& .MuiButton-startIcon': {
                      mr: { sm: 0, md: 1 },
                    },
                    '&:hover': {
                      bgcolor: active ? alpha(dt.accent.main, 0.12) : alpha(dt.text.secondary, 0.06),
                      color: active ? dt.accent.dark : dt.text.primary,
                    },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'none', md: 'inline' } }}>
                    {item.label}
                  </Box>
                </Button>
              </Tooltip>
            );
          })}
        </Box>

        {/* Right Actions */}
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Tooltip title="系统设置" arrow>
            <IconButton
              onClick={() => router.push('/settings')}
              sx={{
                color: pathname === '/settings' ? dt.accent.dark : dt.text.muted,
                bgcolor: pathname === '/settings' ? alpha(dt.accent.main, 0.08) : 'transparent',
              }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="登出" arrow>
            <IconButton
              onClick={handleLogout}
              sx={{ color: dt.text.muted }}
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>

      {/* Mobile Drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: { width: 280, bgcolor: dt.bg.elevated },
        }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.02em',
              background: `linear-gradient(135deg, ${dt.accent.main} 0%, ${dt.purple.main} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            POA Master
          </Typography>
          <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: dt.text.muted }}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Divider />
        <List sx={{ pt: 1 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <ListItemButton
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                sx={{
                  mx: 1,
                  mb: 0.5,
                  borderRadius: '10px',
                  color: active ? dt.accent.dark : dt.text.secondary,
                  bgcolor: active ? alpha(dt.accent.main, 0.08) : 'transparent',
                  '&:hover': {
                    bgcolor: active ? alpha(dt.accent.main, 0.12) : alpha(dt.text.secondary, 0.06),
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: active ? dt.accent.dark : dt.text.muted,
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: active ? 700 : 500,
                    fontSize: '0.9rem',
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
        <Divider sx={{ mt: 1 }} />
        <List>
          <ListItemButton
            onClick={() => handleNavClick('/settings')}
            sx={{
              mx: 1,
              borderRadius: '10px',
              color: pathname === '/settings' ? dt.accent.dark : dt.text.secondary,
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: dt.text.muted }}>
              <SettingsIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="系统设置" primaryTypographyProps={{ fontSize: '0.9rem' }} />
          </ListItemButton>
          <ListItemButton
            onClick={handleLogout}
            sx={{ mx: 1, borderRadius: '10px', color: dt.text.secondary }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: dt.text.muted }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="登出" primaryTypographyProps={{ fontSize: '0.9rem' }} />
          </ListItemButton>
        </List>
      </Drawer>
    </AppBar>
  );
}
