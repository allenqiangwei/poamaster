'use client';

import { useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';

export default function Header() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed');
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if logout fails, redirect to login for security
      router.push('/login');
    }
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          📋 POA Master
        </Typography>
        <Box>
          <Button
            color="inherit"
            startIcon={<SettingsIcon />}
            onClick={() => router.push('/settings')}
          >
            设置
          </Button>
          <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={handleLogout}
          >
            登出
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
