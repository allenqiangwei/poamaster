'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  IconButton,
  Tooltip,
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
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

const NAV_ITEMS = [
  { path: '/', label: '首页', icon: <HomeIcon fontSize="small" />, exact: true },
  { path: '/todo', label: '任务', icon: <ListIcon fontSize="small" /> },
  { path: '/assignees', label: '团队', icon: <PeopleIcon fontSize="small" /> },
  { path: '/pulse', label: '项目', icon: <PulseIcon fontSize="small" /> },
  { path: '/roundtable', label: '圆桌', icon: <RoundtableIcon fontSize="small" /> },
  { path: '/feishu', label: '飞书', icon: <FeishuIcon fontSize="small" /> },
  { path: '/insights', label: '简报', icon: <InsightsIcon fontSize="small" /> },
  { path: '/sentiment', label: '舆情', icon: <MonitorHeartIcon fontSize="small" /> },
];

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();

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

  return (
    <AppBar position="sticky">
      <Toolbar sx={{ gap: 0.5 }}>
        {/* Logo */}
        <Typography
          variant="h6"
          component="div"
          sx={{
            cursor: 'pointer',
            mr: 3,
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

        {/* Navigation */}
        <Box sx={{ flexGrow: 1, display: 'flex', gap: 0.5 }}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item);
            return (
              <Button
                key={item.path}
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
                  '&:hover': {
                    bgcolor: active ? alpha(dt.accent.main, 0.12) : alpha(dt.text.secondary, 0.06),
                    color: active ? dt.accent.dark : dt.text.primary,
                  },
                }}
              >
                {item.label}
              </Button>
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
    </AppBar>
  );
}
