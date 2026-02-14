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
  ToggleButton,
  ToggleButtonGroup,
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
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

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

interface TrendItem {
  date: string;
  gameId: string;
  gameName: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  avgRating: number | null;
  appStore: number;
  googlePlay: number;
}

interface PlatformSummary {
  gameId: string;
  gameName: string;
  appStore: number;
  googlePlay: number;
  total: number;
}

interface GameInfo {
  id: string;
  name: string;
}

const statCards = [
  { key: 'gameCount' as const, label: '监控游戏', icon: SportsEsportsIcon, color: dt.accent.main, subtle: dt.accent.subtle },
  { key: 'todayReviews' as const, label: '今日评论', icon: RateReviewIcon, color: dt.teal.main, subtle: dt.teal.subtle },
  { key: 'todayMentions' as const, label: '今日提及', icon: CampaignIcon, color: dt.purple.main, subtle: dt.purple.subtle },
  { key: 'pendingAlerts' as const, label: '待处理预警', icon: WarningIcon, color: dt.danger.main, subtle: dt.danger.subtle, dynamicColor: true },
];

// Color palette for multiple games
const GAME_COLORS = [
  dt.accent.main, dt.teal.main, dt.purple.main, '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1',
];

export default function SentimentOverviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);

  // Chart state
  const [days, setDays] = useState<number>(7);
  const [allGames, setAllGames] = useState<GameInfo[]>([]);
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [selectedPlatform, setSelectedPlatform] = useState<string>('');
  const [trendData, setTrendData] = useState<TrendItem[]>([]);
  const [platformSummary, setPlatformSummary] = useState<PlatformSummary[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // Fetch overview stats
  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch('/api/sentiment/overview');
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
          setGameStats(data.gameStats);
        }
      } catch { /* silently fail */ }
      finally { setLoading(false); }
    };
    fetchOverview();
  }, []);

  // Fetch trend data
  useEffect(() => {
    const fetchTrends = async () => {
      setChartLoading(true);
      try {
        const params = new URLSearchParams({ days: String(days) });
        if (selectedGameIds.size > 0) {
          params.set('gameIds', Array.from(selectedGameIds).join(','));
        }
        if (selectedPlatform) {
          params.set('platform', selectedPlatform);
        }
        const res = await fetch(`/api/sentiment/trends?${params}`);
        const data = await res.json();
        if (data.success) {
          setTrendData(data.trendData);
          setPlatformSummary(data.platformSummary);
          if (allGames.length === 0) {
            setAllGames(data.games);
            setSelectedGameIds(new Set(data.games.map((g: GameInfo) => g.id)));
          }
        }
      } catch { /* silently fail */ }
      finally { setChartLoading(false); }
    };
    fetchTrends();
  }, [days, selectedPlatform]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when game selection changes
  useEffect(() => {
    if (allGames.length === 0) return;
    const fetchTrends = async () => {
      setChartLoading(true);
      try {
        const params = new URLSearchParams({ days: String(days) });
        if (selectedGameIds.size > 0 && selectedGameIds.size < allGames.length) {
          params.set('gameIds', Array.from(selectedGameIds).join(','));
        }
        if (selectedPlatform) params.set('platform', selectedPlatform);
        const res = await fetch(`/api/sentiment/trends?${params}`);
        const data = await res.json();
        if (data.success) {
          setTrendData(data.trendData);
          setPlatformSummary(data.platformSummary);
        }
      } catch { /* silently fail */ }
      finally { setChartLoading(false); }
    };
    fetchTrends();
  }, [selectedGameIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Refresh all data
        const [overRes, trendRes] = await Promise.all([
          fetch('/api/sentiment/overview'),
          fetch(`/api/sentiment/trends?days=${days}`),
        ]);
        const overData = await overRes.json();
        const trendDataNew = await trendRes.json();
        if (overData.success) { setStats(overData.stats); setGameStats(overData.gameStats); }
        if (trendDataNew.success) { setTrendData(trendDataNew.trendData); setPlatformSummary(trendDataNew.platformSummary); }
      } else {
        setAnalyzeResult(`分析失败: ${data.error}`);
      }
    } catch (e: any) {
      setAnalyzeResult(`分析出错: ${e.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleGameSelection = (gameId: string) => {
    setSelectedGameIds(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) {
        if (next.size > 1) next.delete(gameId); // keep at least 1
      } else {
        next.add(gameId);
      }
      return next;
    });
  };

  // Prepare line chart data: aggregate by date across selected games
  const lineChartData = (() => {
    const dateMap = new Map<string, { date: string; positive: number; neutral: number; negative: number; total: number }>();
    for (const item of trendData) {
      if (!selectedGameIds.has(item.gameId)) continue;
      if (!dateMap.has(item.date)) {
        dateMap.set(item.date, { date: item.date, positive: 0, neutral: 0, negative: 0, total: 0 });
      }
      const entry = dateMap.get(item.date)!;
      entry.positive += item.positive;
      entry.neutral += item.neutral;
      entry.negative += item.negative;
      entry.total += item.total;
    }
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  })();

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
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
            {analyzing ? '分析中...' : '情感分析'}
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
            mb: 2, p: 1.5, borderRadius: 1,
            bgcolor: analyzeResult.includes('失败') || analyzeResult.includes('出错') ? dt.danger.subtle : dt.success.subtle,
            color: analyzeResult.includes('失败') || analyzeResult.includes('出错') ? dt.danger.dark : dt.success.dark,
          }}
        >
          {analyzeResult}
        </Typography>
      )}

      {/* Stat Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((sc) => {
          const value = stats?.[sc.key] ?? 0;
          const cardColor = sc.dynamicColor && value === 0 ? dt.success.main : sc.color;
          const cardSubtle = sc.dynamicColor && value === 0 ? dt.success.subtle : sc.subtle;
          const Icon = sc.icon;
          return (
            <Grid key={sc.key} size={{ xs: 6, md: 3 }}>
              <Card>
                <CardContent sx={{ py: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: cardSubtle, flexShrink: 0 }}>
                    <Icon sx={{ color: cardColor, fontSize: 24 }} />
                  </Box>
                  <Box>
                    <Typography variant="h5" sx={{ color: dt.text.primary, fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
                    <Typography variant="caption" sx={{ color: dt.text.muted }}>{sc.label}</Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* Charts Section */}
      {allGames.length > 0 && (
        <>
          {/* Filter Controls */}
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Stack spacing={1.5}>
                {/* Time range + Platform */}
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: dt.text.muted, display: 'block', mb: 0.5 }}>时间范围</Typography>
                    <ToggleButtonGroup
                      value={days}
                      exclusive
                      onChange={(_, v) => v && setDays(v)}
                      size="small"
                    >
                      <ToggleButton value={7} sx={{ px: 2 }}>7天</ToggleButton>
                      <ToggleButton value={30} sx={{ px: 2 }}>30天</ToggleButton>
                      <ToggleButton value={90} sx={{ px: 2 }}>90天</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: dt.text.muted, display: 'block', mb: 0.5 }}>评论来源</Typography>
                    <ToggleButtonGroup
                      value={selectedPlatform || 'all'}
                      exclusive
                      onChange={(_, v) => setSelectedPlatform(v === 'all' ? '' : v || '')}
                      size="small"
                    >
                      <ToggleButton value="all" sx={{ px: 2 }}>全部</ToggleButton>
                      <ToggleButton value="APP_STORE" sx={{ px: 2 }}>App Store</ToggleButton>
                      <ToggleButton value="GOOGLE_PLAY" sx={{ px: 2 }}>Google Play</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                </Stack>

                {/* Game chips */}
                {allGames.length > 1 && (
                  <Box>
                    <Typography variant="caption" sx={{ color: dt.text.muted, display: 'block', mb: 0.5 }}>游戏筛选</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {allGames.map((game, idx) => {
                        const isSelected = selectedGameIds.has(game.id);
                        const gameColor = GAME_COLORS[idx % GAME_COLORS.length];
                        return (
                          <Chip
                            key={game.id}
                            label={game.name}
                            size="small"
                            onClick={() => toggleGameSelection(game.id)}
                            sx={{
                              bgcolor: isSelected ? alpha(gameColor, 0.15) : 'transparent',
                              color: isSelected ? gameColor : dt.text.muted,
                              border: `1px solid ${isSelected ? gameColor : dt.border.default}`,
                              fontWeight: isSelected ? 600 : 400,
                              cursor: 'pointer',
                              '&:hover': { bgcolor: alpha(gameColor, 0.1) },
                            }}
                          />
                        );
                      })}
                    </Stack>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* Sentiment Trend Line Chart */}
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                每日情感趋势
              </Typography>
              {chartLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : lineChartData.length === 0 ? (
                <Typography variant="body2" sx={{ color: dt.text.muted, textAlign: 'center', py: 6 }}>
                  暂无数据
                </Typography>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={lineChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                    />
                    <YAxis
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dt.bg.elevated,
                        border: `1px solid ${dt.border.default}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      labelFormatter={(label) => `日期: ${label}`}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="positive"
                      name="正面"
                      stroke={dt.success.main}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="neutral"
                      name="中性"
                      stroke={dt.warning.main}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="negative"
                      name="负面"
                      stroke={dt.danger.main}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Platform Distribution Bar Chart */}
          {platformSummary.length > 0 && !selectedPlatform && (
            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  评论来源分布
                </Typography>
                <ResponsiveContainer width="100%" height={Math.max(200, platformSummary.length * 60)}>
                  <BarChart
                    data={platformSummary}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      type="number"
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                      allowDecimals={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="gameName"
                      tick={{ fill: dt.text.secondary, fontSize: 13 }}
                      stroke={dt.border.default}
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dt.bg.elevated,
                        border: `1px solid ${dt.border.default}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="appStore"
                      name="App Store"
                      fill={dt.accent.main}
                      stackId="platform"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="googlePlay"
                      name="Google Play"
                      fill={dt.success.main}
                      stackId="platform"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

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
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => router.push('/sentiment/games')}>
              添加游戏
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {gameStats.map((game) => (
            <Grid key={game.id} size={{ xs: 12, sm: 6, md: 4 }}>
              <Card sx={{ height: '100%' }}>
                <CardActionArea onClick={() => router.push(`/sentiment/games/${game.id}`)} sx={{ height: '100%' }}>
                  <CardContent sx={{ py: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <Box sx={{ width: 36, height: 36, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(dt.accent.main, 0.08), flexShrink: 0 }}>
                        <SportsEsportsIcon sx={{ color: dt.accent.main, fontSize: 20 }} />
                      </Box>
                      <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600 }}>{game.name}</Typography>
                    </Box>
                    <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
                      {game.avgRating !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <StarIcon sx={{ fontSize: 16, color: dt.warning.main }} />
                          <Typography variant="body2" sx={{ color: dt.text.secondary, fontWeight: 600 }}>{game.avgRating.toFixed(1)}</Typography>
                        </Box>
                      )}
                      {game.positiveRatio !== null && (
                        <Typography variant="body2" sx={{ color: dt.success.main, fontWeight: 600 }}>{game.positiveRatio}% 好评</Typography>
                      )}
                      <Typography variant="body2" sx={{ color: dt.text.muted }}>{game.reviewCount} 条评论</Typography>
                    </Stack>
                    {game.topIssues.length > 0 && (
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
                        {game.topIssues.map((issue) => (
                          <Chip key={issue} label={issue} size="small" sx={{ height: 22, fontSize: '0.7rem', bgcolor: alpha(dt.accent.main, 0.06), color: dt.accent.dark, border: 'none' }} />
                        ))}
                      </Stack>
                    )}
                    {game.unreadAlerts > 0 && (
                      <Chip icon={<WarningIcon sx={{ fontSize: 14 }} />} label={`${game.unreadAlerts} 条未读预警`} size="small" sx={{ height: 22, fontSize: '0.7rem', bgcolor: dt.danger.subtle, color: dt.danger.dark, border: 'none', '& .MuiChip-icon': { color: dt.danger.main } }} />
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
