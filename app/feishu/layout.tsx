'use client';

import { Box } from '@mui/material';
import Header from '@/components/Header';

export default function FeishuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <Header />
      <Box component="main" sx={{ px: { xs: 2, sm: 3, md: 4 }, py: 3, maxWidth: 1400, mx: 'auto' }}>
        {children}
      </Box>
    </Box>
  );
}
