'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import {
  Container,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box
} from '@mui/material';
import { CheckBox as TodoIcon, Assessment as PulseIcon } from '@mui/icons-material';

export default function HomePage() {
  const router = useRouter();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        工具集合
      </Typography>

      <Box
        sx={{
          mt: 2,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'repeat(3, 1fr)'
          },
          gap: 3
        }}
      >
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <TodoIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
              <Typography variant="h5">
                待办事项
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              AI 驱动的任务管理工具，支持从文本、文件、图片中提取任务
            </Typography>
          </CardContent>
          <CardActions>
            <Button
              size="small"
              variant="contained"
              fullWidth
              onClick={() => router.push('/todo')}
            >
              进入工具
            </Button>
          </CardActions>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <PulseIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
              <Typography variant="h5">
                项目管理
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              项目健康度追踪工具，支持多维度评估和风险预警
            </Typography>
          </CardContent>
          <CardActions>
            <Button
              size="small"
              variant="contained"
              fullWidth
              onClick={() => router.push('/pulse')}
            >
              进入工具
            </Button>
          </CardActions>
        </Card>
      </Box>
    </Container>
  );
}
