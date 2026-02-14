'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CardActionArea,
  Chip,
  Grid,
  CircularProgress,
  Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import RateReviewIcon from '@mui/icons-material/RateReview';
import CampaignIcon from '@mui/icons-material/Campaign';
import WarningIcon from '@mui/icons-material/Warning';
import StarIcon from '@mui/icons-material/Star';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { useRouter } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';

interface Stats {
  gameCount: number;
  todayReviews: number;
  todayMentions: number;
  pendingAlerts: number;
}

interface GameStat {
  id: string;
  name: string;
  iconUrl: string | null;
  avgRating: number | null;
  positiveRatio: number | null;
  reviewCount: number;
  topIssues: string[];
  unreadAlerts: number;
}

const statCards = [
  {
    key: 'gameCount' as const,
    label: '监控游戏',
    icon: SportsEsportsIcon,
    color: dt.accent.main,
    subtle: dt.accent.subtle,
  },
  {
    key: 'todayReviews' as const,
    label: '今日评论',
    icon: RateReviewIcon,
    color: dt.teal.main,
    subtle: dt.teal.subtle,
  },
  {
    key: 'todayMentions' as const,
    label: '今日提及',
    icon: CampaignIcon,
    color: dt.purple.main,
    subtle: dt.purple.subtle,
  },
  {
    key: 'pendingAlerts' as const,
    label: '待处理预警',
    icon: WarningIcon,
    color: dt.danger.main,
    subtle: dt.danger.subtle,
    dynamicColor: true,
  },
];

export default function SentimentOverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch('/api/sentiment/overview');
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
          setGameStats(data.gameStats);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const res = await fetch('/api/sentiment/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setAnalyzeResult(`已分析 ${data.analyzed} 条评论`);
        // Refresh overview
        const overRes = await fetch('/api/sentiment/overview');
        const overData = await overRes.json();
        if (overData.success) {
          setStats(overData.stats);
          setGameStats(overData.gameStats);
        }
      } else {
        setAnalyzeResult(`分析失败: ${data.error}`);
      }
    } catch (e: any) {
      setAnalyzeResult(`分析出错: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700 }}>
          舆情监控
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <AutoFixHighIcon />}
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? '分析中...' : 'AI 分析评论'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => router.push('/sentiment/games')}
          >
            管理游戏
          </Button>
        </Stack>
      </Box>

      {/* Analyze result */}
      {analyzeResult && (
        <Typography
          variant="body2"
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 1,
            bgcolor: analyzeResult.includes('失败') || analyzeResult.includes('出错')
              ? dt.danger.subtle : dt.success.subtle,
            color: analyzeResult.includes('失败') || analyzeResult.includes('出错')
              ? dt.danger.dark : dt.success.dark,
          }}
        >
          {analyzeResult}
        </Typography>
      )}

      {/* Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((sc) => {
          const value = stats?.[sc.key] ?? 0;
          const cardColor =
            sc.dynamicColor && value === 0 ? dt.success.main : sc.color;
          const cardSubtle =
            sc.dynamicColor && value === 0 ? dt.success.subtle : sc.subtle;
          const Icon = sc.icon;

          return (
            <Grid key={sc.key} size={{ xs: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ py: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: cardSubtle,
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ color: cardColor, fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ color: dt.text.primary, fontWeight: 700, lineHeight: 1.2 }}>
                      {value}
                    </Typography>
                    <Typography variant="caption" sx={{ color: dt.text.muted }}>
                      {sc.label}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Game Status Cards */}
      {gameStats.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <SportsEsportsIcon sx={{ fontSize: 64, color: dt.text.muted, mb: 2 }} />
            <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
              还没有监控的游戏
            </Typography>
            <Typography variant="body2" sx={{ color: dt.text.muted, mb: 3 }}>
              添加游戏后就可以在这里看到舆情概览
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => router.push('/sentiment/games')}
            >
              添加游戏
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {gameStats.map((game) => (
            <Grid key={game.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea
                  onClick={() => router.push(`/sentiment/games/${game.id}`)}
                  sx={{ height: '100%' }}
                >
                  <CardContent sx={{ py: 2.5 }}>
                    {/* Game name row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(dt.accent.main, 0.08),
                          flexShrink: 0,
                        }}
                      >
                        <SportsEsportsIcon sx={{ color: dt.accent.main, fontSize: 20 }} />
                      </Box>
                      <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600 }}>
                        {game.name}
                      </Typography>
                    </Box>

                    {/* Stats row */}
                    <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
                      {game.avgRating !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <StarIcon sx={{ fontSize: 16, color: dt.warning.main }} />
                          <Typography variant="body2" sx={{ color: dt.text.secondary, fontWeight: 600 }}>
                            {game.avgRating.toFixed(1)}
                          </Typography>
                        </Box>
                      )}
                      {game.positiveRatio !== null && (
                        <Typography variant="body2" sx={{ color: dt.success.main, fontWeight: 600 }}>
                          {game.positiveRatio}% 好评
                        </Typography>
                      )}
                      <Typography variant="body2" sx={{ color: dt.text.muted }}>
                        {game.reviewCount} 条评论
                      </Typography>
                    </Stack>

                    {/* Top issues */}
                    {game.topIssues.length > 0 && (
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                        {game.topIssues.map((issue) => (
                          <Chip
                            key={issue}
                            label={issue}
                            size="small"
                            sx={{
                              height: 22,
                              fontSize: '0.7rem',
                              bgcolor: alpha(dt.accent.main, 0.06),
                              color: dt.accent.dark,
                              border: 'none',
                            }}
                          />
                        ))}
                      </Stack>
                    )}

                    {/* Unread alerts */}
                    {game.unreadAlerts > 0 && (
                      <Chip
                        icon={<WarningIcon sx={{ fontSize: 14 }} />}
                        label={`${game.unreadAlerts} 条未读预警`}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.7rem',
                          bgcolor: dt.danger.subtle,
                          color: dt.danger.dark,
                          border: 'none',
                          '& .MuiChip-icon': { color: dt.danger.main },
                        }}
                      />
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
