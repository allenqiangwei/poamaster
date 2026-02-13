'use client';

import { useRouter, usePathname } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box
} from '@mui/material';
import {
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Home as HomeIcon,
  List as ListIcon,
  People as PeopleIcon,
  Assessment as PulseIcon,
  Forum as RoundtableIcon,
  Chat as FeishuIcon
} from '@mui/icons-material';

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
      // Even if logout fails, redirect to login for security
      router.push('/login');
    }
  };

  const isActive = (path: string) => pathname === path;

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography
          variant="h6"
          component="div"
          sx={{
            cursor: 'pointer',
            mr: 3
          }}
          onClick={() => router.push('/')}
        >
          📋 POA Master
        </Typography>

        <Box sx={{ flexGrow: 1, display: 'flex', gap: 1 }}>
          <Button
            color="inherit"
            startIcon={<HomeIcon />}
            onClick={() => router.push('/')}
            sx={{
              bgcolor: isActive('/') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
            }}
          >
            首页
          </Button>
          <Button
            color="inherit"
            startIcon={<ListIcon />}
            onClick={() => router.push('/todo')}
            sx={{
              bgcolor: pathname?.startsWith('/todo') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
            }}
          >
            任务列表
          </Button>
          <Button
            color="inherit"
            startIcon={<PeopleIcon />}
            onClick={() => router.push('/assignees')}
            sx={{
              bgcolor: pathname?.startsWith('/assignees') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
            }}
          >
            负责人
          </Button>
          <Button
            color="inherit"
            startIcon={<PulseIcon />}
            onClick={() => router.push('/pulse')}
            sx={{
              bgcolor: pathname?.startsWith('/pulse') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
            }}
          >
            项目管理
          </Button>
          <Button
            color="inherit"
            startIcon={<RoundtableIcon />}
            onClick={() => router.push('/roundtable')}
            sx={{
              bgcolor: pathname?.startsWith('/roundtable') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
            }}
          >
            圆桌会议
          </Button>
          <Button
            color="inherit"
            startIcon={<FeishuIcon />}
            onClick={() => router.push('/feishu')}
            sx={{
              bgcolor: pathname?.startsWith('/feishu') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
            }}
          >
            飞书集成
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            color="inherit"
            startIcon={<SettingsIcon />}
            onClick={() => router.push('/settings')}
            sx={{
              bgcolor: isActive('/settings') ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
            }}
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
