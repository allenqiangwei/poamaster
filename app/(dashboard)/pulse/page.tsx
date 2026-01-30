'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActions,
  Grid,
  Chip,
  Alert,
  CircularProgress,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { STALE_THRESHOLD_DAYS, KEY_DIMENSIONS, DIMENSION_LABELS } from '@/lib/pulse/constants';

interface Project {
  id: string;
  name: string;
  updatedAt: string;
  _count: { entries: number };
}

interface ProjectStats {
  total: number;
  byDimension: Record<string, number>;
}

export default function PulseProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<Record<string, ProjectStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/pulse/projects');
      const data = await res.json();
      if (data.success) {
        setProjects(data.data);
        // Fetch stats for each project
        for (const project of data.data) {
          const statsRes = await fetch(`/api/pulse/projects/${project.id}/stats`);
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(prev => ({ ...prev, [project.id]: statsData.data }));
          }
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to fetch projects');
    } finally {
      setLoading(false);
    }
  };

  const isStale = (updatedAt: string) => {
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysSinceUpdate > STALE_THRESHOLD_DAYS;
  };

  const getDaysSinceUpdate = (updatedAt: string) => {
    return Math.floor(
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">项目管理</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => router.push('/pulse/new')}
        >
          新建项目
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {projects.length === 0 ? (
        <Alert severity="info">暂无项目，点击右上角创建第一个项目</Alert>
      ) : (
        <Grid container spacing={3}>
          {projects.map((project) => {
            const projectStats = stats[project.id];
            const stale = isStale(project.updatedAt);
            const daysSince = getDaysSinceUpdate(project.updatedAt);

            return (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={project.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { boxShadow: 4 },
                    border: stale ? '1px solid orange' : undefined,
                  }}
                  onClick={() => router.push(`/pulse/${project.id}`)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="h6" gutterBottom>
                        {project.name}
                      </Typography>
                      {stale && (
                        <Chip
                          icon={<WarningAmberIcon />}
                          label={`${daysSince}天未更新`}
                          color="warning"
                          size="small"
                        />
                      )}
                    </Box>

                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      最后更新: {new Date(project.updatedAt).toLocaleString('zh-CN')}
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                      {projectStats && KEY_DIMENSIONS.map((dim) => (
                        <Chip
                          key={dim}
                          label={`${DIMENSION_LABELS[dim]}: ${projectStats.byDimension[dim] || 0}`}
                          size="small"
                          color={projectStats.byDimension[dim] > 0 ? 'primary' : 'default'}
                          variant="outlined"
                        />
                      ))}
                      <Chip
                        label={`总计: ${projectStats?.total || 0}`}
                        size="small"
                        variant="filled"
                      />
                    </Box>
                  </CardContent>
                  <CardActions>
                    <Button size="small" onClick={(e) => { e.stopPropagation(); router.push(`/pulse/${project.id}`); }}>
                      进入
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
