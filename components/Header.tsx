'use client';

import { useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';

export default function Header() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" component="div">
          📋 POA Master
        </Typography>
        <IconButton
          color="inherit"
          onClick={() => router.push('/settings')}
        >
          <SettingsIcon />
        </IconButton>
        <IconButton
          color="inherit"
          onClick={handleLogout}
        >
          <LogoutIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
