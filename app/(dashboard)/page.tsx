'use client';

import { useRouter } from 'next/navigation';
import {
  Container,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Box
} from '@mui/material';
import { CheckBox as TodoIcon } from '@mui/icons-material';

export default function HomePage() {
  const router = useRouter();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        工具集合
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TodoIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Typography variant="h5">
                  To-Do List
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
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ bgcolor: 'grey.100' }}>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                工具 2
              </Typography>
              <Typography variant="body2" color="text.secondary">
                即将推出...
              </Typography>
            </CardContent>
            <CardActions>
              <Button size="small" disabled fullWidth>
                敬请期待
              </Button>
            </CardActions>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
