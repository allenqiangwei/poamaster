'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  IconButton,
  CircularProgress,
  Grid,
  Tabs,
  Tab,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  Stack,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useRouter, useParams } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────

interface CompetitorDetail {
  id: string;
  name: string;
  company: string | null;
  appStoreId: string | null;
  googlePlayId: string | null;
}

interface RatingTrendPoint {
  date: string;
  rating: number;
}

interface SentimentData {
  name: string;
  value: number;
}

interface ReviewVolumePoint {
  date: string;
  good: number;
  mid: number;
  bad: number;
}

interface TagData {
  tag: string;
  count: number;
}

interface VersionInfo {
  version: string;
  date: string;
  rating: number | null;
  releaseNotes: string | null;
}

interface ReviewItem {
  id: string;
  rating: number;
  title: string | null;
  content: string;
  sentiment: string;
  tags: string[];
  date: string;
  platform: string;
}

interface PaginationInfo {
  page: number;
  totalPages: number;
  total: number;
}

interface NewsItem {
  id: string;
  type: 'news' | 'webchange';
  title: string;
  summary: string | null;
  url: string | null;
  source: string;
  isHighImpact: boolean;
  createdAt: string;
}

interface ChartData {
  ratingTrend: RatingTrendPoint[];
  sentiment: SentimentData[];
  reviewVolume: ReviewVolumePoint[];
  topTags: TagData[];
}

interface DetailResponse {
  competitor: CompetitorDetail;
  currentRating: number | null;
  ratingTrend: number | null;
  charts: ChartData;
  versions: VersionInfo[];
}

// ─── Constants ───────────────────────────────────────────────

const SENTIMENT_COLORS = {
  positive: '#22C55E',
  neutral: '#9CA3AF',
  negative: '#EF4444',
};

// ─── Component ───────────────────────────────────────────────

export default function CompetitorDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  // Detail + chart data
  const [competitor, setCompetitor] = useState<CompetitorDetail | null>(null);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const [ratingTrend7d, setRatingTrend7d] = useState<number | null>(null);
  const [charts, setCharts] = useState<ChartData>({
    ratingTrend: [],
    sentiment: [],
    reviewVolume: [],
    topTags: [],
  });
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [chartDays, setChartDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);

  // Reviews tab state
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [reviewPagination, setReviewPagination] = useState<PaginationInfo>({
    page: 1,
    totalPages: 1,
    total: 0,
  });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewPlatform, setReviewPlatform] = useState<string>('all');
  const [reviewRating, setReviewRating] = useState<string>('all');
  const [reviewSentiment, setReviewSentiment] = useState<string>('all');
  const [reviewDays, setReviewDays] = useState<number>(30);
  const [reviewPage, setReviewPage] = useState(1);

  // News tab state
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsPagination, setNewsPagination] = useState<PaginationInfo>({ page: 1, totalPages: 1, total: 0 });
  const [newsPage, setNewsPage] = useState(1);
  const [newsDays, setNewsDays] = useState<number>(30);

  // ─── Data Fetching ─────────────────────────────────────────

  const loadDetail = useCallback(async (days: number) => {
    try {
      const res = await fetch(`/api/competitors/${id}/detail?days=${days}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success !== false) {
        setCompetitor(data.competitor);
        setCurrentRating(data.currentRating);
        setRatingTrend7d(data.ratingTrend);
        // Transform sentiment from API object to chart array
        const s = data.charts?.sentiment || {};
        setCharts({
          ratingTrend: data.charts?.ratingTrend || [],
          sentiment: [
            { name: '正面', value: s.positive || 0 },
            { name: '中性', value: s.neutral || 0 },
            { name: '负面', value: s.negative || 0 },
          ],
          reviewVolume: data.charts?.reviewVolume || [],
          topTags: data.charts?.topTags || [],
        });
        setVersions(data.versions || []);
      }
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(reviewPage),
        days: String(reviewDays),
      });
      if (reviewPlatform !== 'all') params.set('platform', reviewPlatform);
      if (reviewRating !== 'all') params.set('rating', reviewRating);
      if (reviewSentiment !== 'all') params.set('sentiment', reviewSentiment);

      const res = await fetch(`/api/competitors/${id}/reviews?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.reviews) {
        // Transform API fields to match ReviewItem interface
        setReviews(data.reviews.map((r: any) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          content: r.content || '',
          sentiment: r.sentiment !== null
            ? (r.sentiment > 0.3 ? 'positive' : r.sentiment < -0.3 ? 'negative' : 'neutral')
            : 'neutral',
          tags: r.tags || [],
          date: r.reviewDate ? new Date(r.reviewDate).toISOString() : '',
          platform: r.platform || '',
        })));
        setReviewPagination(data.pagination);
      }
    } catch {
      /* silently fail */
    } finally {
      setReviewsLoading(false);
    }
  }, [id, reviewPage, reviewPlatform, reviewRating, reviewSentiment, reviewDays]);

  const loadNews = useCallback(async () => {
    setNewsLoading(true);
    try {
      const params = new URLSearchParams({
        competitorId: id,
        days: String(newsDays),
        page: String(newsPage),
      });
      const res = await fetch(`/api/competitors/news?${params}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.items) {
        setNewsItems(data.items.map((item: any) => ({
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
        })));
        setNewsPagination(data.pagination);
      }
    } catch {
      /* silently fail */
    } finally {
      setNewsLoading(false);
    }
  }, [id, newsDays, newsPage]);

  // Initial load
  useEffect(() => {
    loadDetail(chartDays);
  }, [loadDetail, chartDays]);

  // Load reviews when switching to tab 1 or when filters change
  useEffect(() => {
    if (activeTab === 1) {
      loadReviews();
    }
  }, [activeTab, loadReviews]);

  // Load news when switching to tab 3
  useEffect(() => {
    if (activeTab === 3) {
      loadNews();
    }
  }, [activeTab, loadNews]);

  // ─── Helpers ───────────────────────────────────────────────

  const formatChartDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const formatFullDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const renderStars = (rating: number) => (
    <Stack direction="row" spacing={0}>
      {[1, 2, 3, 4, 5].map((star) =>
        star <= rating ? (
          <StarIcon key={star} sx={{ fontSize: 16, color: dt.warning.main }} />
        ) : (
          <StarBorderIcon key={star} sx={{ fontSize: 16, color: dt.border.strong }} />
        )
      )}
    </Stack>
  );

  const getSentimentChip = (sentiment: string) => {
    switch (sentiment) {
      case 'positive':
        return <Chip label="正面" size="small" sx={{ bgcolor: alpha('#22C55E', 0.1), color: '#16A34A', fontWeight: 600, fontSize: '0.75rem' }} />;
      case 'negative':
        return <Chip label="负面" size="small" color="error" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />;
      default:
        return <Chip label="中性" size="small" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />;
    }
  };

  const getSourceChip = (type: string, source: string) => {
    if (type === 'webchange') {
      return source === 'major_update'
        ? <Chip label="重大变更" size="small" color="error" sx={{ fontWeight: 600, fontSize: '0.75rem' }} />
        : <Chip label="网页变更" size="small" sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: alpha('#F59E0B', 0.1), color: '#D97706' }} />;
    }
    return <Chip label="新闻" size="small" sx={{ fontWeight: 600, fontSize: '0.75rem', bgcolor: alpha(dt.accent.main, 0.1), color: dt.accent.dark }} />;
  };

  const formatRelativeTime = (dateStr: string) => {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
    return formatFullDate(dateStr);
  };

  // ─── Loading State ─────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!competitor) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" sx={{ color: dt.text.secondary }}>
          竞品不存在
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: dt.accent.main, cursor: 'pointer', mt: 2 }}
          onClick={() => router.push('/insights/competitors')}
        >
          返回竞品监控
        </Typography>
      </Box>
    );
  }

  const platforms: string[] = [];
  if (competitor.appStoreId) platforms.push('App Store');
  if (competitor.googlePlayId) platforms.push('Google Play');

  const sentimentTotal = charts.sentiment.reduce((sum, s) => sum + s.value, 0);

  // ─── Render ────────────────────────────────────────────────

  return (
    <Box>
      {/* ═══ Header ═══ */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 3 }}>
        <IconButton
          onClick={() => router.push('/insights/competitors')}
          size="small"
          sx={{ mt: 0.5 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ color: dt.text.primary, fontWeight: 700 }}>
              {competitor.name}
            </Typography>
            {platforms.map((p) => (
              <Chip
                key={p}
                label={p}
                size="small"
                variant="outlined"
                sx={{
                  height: 24,
                  fontSize: '0.75rem',
                  borderColor: p === 'App Store'
                    ? alpha(dt.accent.main, 0.4)
                    : alpha(dt.success.main, 0.4),
                  color: p === 'App Store' ? dt.accent.dark : dt.success.dark,
                }}
              />
            ))}
          </Box>
          {competitor.company && (
            <Typography variant="body2" sx={{ color: dt.text.muted, mt: 0.25 }}>
              {competitor.company}
            </Typography>
          )}
        </Box>
        {/* Current rating + trend */}
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          {currentRating !== null ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700, lineHeight: 1 }}>
                  {currentRating.toFixed(1)}
                </Typography>
                <StarIcon sx={{ fontSize: 24, color: dt.warning.main }} />
              </Box>
              {ratingTrend7d !== null && ratingTrend7d !== 0 && (
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25,
                  justifyContent: 'flex-end',
                  mt: 0.25,
                  color: ratingTrend7d > 0 ? dt.success.main : dt.danger.main,
                }}>
                  {ratingTrend7d > 0
                    ? <TrendingUpIcon sx={{ fontSize: 16 }} />
                    : <TrendingDownIcon sx={{ fontSize: 16 }} />
                  }
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {ratingTrend7d > 0 ? '+' : ''}{ratingTrend7d.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: dt.text.muted, ml: 0.5 }}>
                    7天
                  </Typography>
                </Box>
              )}
            </>
          ) : (
            <Typography variant="body2" sx={{ color: dt.text.muted }}>暂无评分</Typography>
          )}
        </Box>
      </Box>

      {/* ═══ Tabs ═══ */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: `1px solid ${dt.border.default}` }}
      >
        <Tab label="评分与情感" />
        <Tab label="评论列表" />
        <Tab label="版本更新" />
        <Tab label="新闻动态" />
      </Tabs>

      {/* ═══ Tab 0: Rating & Sentiment ═══ */}
      {activeTab === 0 && (
        <Grid container spacing={2.5}>
          {/* Rating Trend LineChart */}
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600 }}>
                    评分趋势
                  </Typography>
                  <ToggleButtonGroup
                    value={chartDays}
                    exclusive
                    onChange={(_, v) => { if (v !== null) setChartDays(v); }}
                    size="small"
                  >
                    <ToggleButton value={7} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>7天</ToggleButton>
                    <ToggleButton value={30} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>30天</ToggleButton>
                    <ToggleButton value={90} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>90天</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={charts.ratingTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                    />
                    <YAxis
                      domain={[1, 5]}
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                      allowDecimals
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
                    <Line
                      type="monotone"
                      dataKey="rating"
                      stroke={dt.accent.main}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Sentiment PieChart */}
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  情感分布
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={charts.sentiment}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {charts.sentiment.map((entry) => {
                        let color = SENTIMENT_COLORS.neutral;
                        if (entry.name === '正面') color = SENTIMENT_COLORS.positive;
                        if (entry.name === '负面') color = SENTIMENT_COLORS.negative;
                        return <Cell key={entry.name} fill={color} />;
                      })}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dt.bg.elevated,
                        border: `1px solid ${dt.border.default}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      formatter={(value: any, name: any) => {
                        return [`${value}`, name];
                      }}
                    />
                    {/* Center label showing total */}
                    <text
                      x="50%"
                      y="46%"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={22}
                      fontWeight={700}
                      fill={dt.text.primary}
                    >
                      {sentimentTotal}
                    </text>
                    <text
                      x="50%"
                      y="56%"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={12}
                      fill={dt.text.muted}
                    >
                      条评论
                    </text>
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 1 }}>
                  {charts.sentiment.map((entry) => {
                    let color = SENTIMENT_COLORS.neutral;
                    if (entry.name === '正面') color = SENTIMENT_COLORS.positive;
                    if (entry.name === '负面') color = SENTIMENT_COLORS.negative;
                    return (
                      <Box key={entry.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                        <Typography variant="caption" sx={{ color: dt.text.secondary }}>
                          {entry.name} {entry.value}
                        </Typography>
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {/* Review Volume Stacked BarChart */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  评论量趋势
                </Typography>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={charts.reviewVolume} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatChartDate}
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
                    <Bar dataKey="good" stackId="a" fill={SENTIMENT_COLORS.positive} name="好评" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="mid" stackId="a" fill={SENTIMENT_COLORS.neutral} name="中评" />
                    <Bar dataKey="bad" stackId="a" fill={SENTIMENT_COLORS.negative} name="差评" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Top Tags Horizontal BarChart */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  热门标签 Top 10
                </Typography>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={charts.topTags.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
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
                      dataKey="tag"
                      tick={{ fill: dt.text.secondary, fontSize: 12 }}
                      stroke={dt.border.default}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dt.bg.elevated,
                        border: `1px solid ${dt.border.default}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    />
                    <Bar dataKey="count" fill={dt.accent.main} radius={[0, 4, 4, 0]} name="数量" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* ═══ Tab 1: Reviews ═══ */}
      {activeTab === 1 && (
        <>
          {/* Filter Bar */}
          <Card sx={{ mb: 2.5 }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}>
                {/* Platform */}
                <Box>
                  <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                    平台
                  </Typography>
                  <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select
                      value={reviewPlatform}
                      onChange={(e) => { setReviewPlatform(e.target.value); setReviewPage(1); }}
                    >
                      <MenuItem value="all">全部</MenuItem>
                      {competitor.appStoreId && <MenuItem value="appstore">App Store</MenuItem>}
                      {competitor.googlePlayId && <MenuItem value="googleplay">Google Play</MenuItem>}
                    </Select>
                  </FormControl>
                </Box>

                {/* Rating */}
                <Box>
                  <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                    评分
                  </Typography>
                  <ToggleButtonGroup
                    value={reviewRating}
                    exclusive
                    onChange={(_, v) => { if (v !== null) { setReviewRating(v); setReviewPage(1); } }}
                    size="small"
                  >
                    <ToggleButton value="all" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>全部</ToggleButton>
                    <ToggleButton value="1-2" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>1-2星</ToggleButton>
                    <ToggleButton value="3" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>3星</ToggleButton>
                    <ToggleButton value="4-5" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>4-5星</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Sentiment */}
                <Box>
                  <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                    情感
                  </Typography>
                  <ToggleButtonGroup
                    value={reviewSentiment}
                    exclusive
                    onChange={(_, v) => { if (v !== null) { setReviewSentiment(v); setReviewPage(1); } }}
                    size="small"
                  >
                    <ToggleButton value="all" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>全部</ToggleButton>
                    <ToggleButton value="positive" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>正面</ToggleButton>
                    <ToggleButton value="neutral" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>中性</ToggleButton>
                    <ToggleButton value="negative" sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>负面</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Days */}
                <Box>
                  <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                    时间范围
                  </Typography>
                  <ToggleButtonGroup
                    value={reviewDays}
                    exclusive
                    onChange={(_, v) => { if (v !== null) { setReviewDays(v); setReviewPage(1); } }}
                    size="small"
                  >
                    <ToggleButton value={7} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>7天</ToggleButton>
                    <ToggleButton value={30} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>30天</ToggleButton>
                    <ToggleButton value={90} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>90天</ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Total count */}
                <Box sx={{ ml: 'auto', alignSelf: 'flex-end' }}>
                  <Typography variant="body2" sx={{ color: dt.text.muted }}>
                    共 <Box component="span" sx={{ color: dt.text.primary, fontWeight: 600 }}>{reviewPagination.total}</Box> 条
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Reviews Table */}
          {reviewsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} />
            </Box>
          ) : reviews.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
                  暂无评论数据
                </Typography>
                <Typography variant="body2" sx={{ color: dt.text.muted }}>
                  评论将在采集后自动出现
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 80 }}>评分</TableCell>
                    <TableCell sx={{ width: 140 }}>标题</TableCell>
                    <TableCell>内容</TableCell>
                    <TableCell sx={{ width: 80 }}>情感</TableCell>
                    <TableCell sx={{ width: 160 }}>标签</TableCell>
                    <TableCell sx={{ width: 100 }}>日期</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reviews.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell>{renderStars(review.rating)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: dt.text.primary, fontSize: '0.8rem' }}>
                          {review.title || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: dt.text.secondary, fontSize: '0.8rem' }}>
                          {review.content.length > 100
                            ? review.content.slice(0, 100) + '...'
                            : review.content}
                        </Typography>
                      </TableCell>
                      <TableCell>{getSentimentChip(review.sentiment)}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {review.tags.slice(0, 3).map((tag) => (
                            <Chip
                              key={tag}
                              label={tag}
                              size="small"
                              sx={{
                                height: 20,
                                fontSize: '0.65rem',
                                bgcolor: alpha(dt.accent.main, 0.06),
                                color: dt.accent.dark,
                                border: 'none',
                              }}
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: dt.text.muted }}>
                          {formatFullDate(review.date)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Pagination */}
          {reviewPagination.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={reviewPagination.totalPages}
                page={reviewPage}
                onChange={(_, value) => setReviewPage(value)}
                color="primary"
                shape="rounded"
              />
            </Box>
          )}
        </>
      )}

      {/* ═══ Tab 2: Versions ═══ */}
      {activeTab === 2 && (
        <Box>
          {versions.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
                  暂无版本记录
                </Typography>
                <Typography variant="body2" sx={{ color: dt.text.muted }}>
                  版本信息将在采集后自动更新
                </Typography>
              </CardContent>
            </Card>
          ) : (
            versions.map((v, i) => (
              <Box key={v.version} sx={{ display: 'flex', gap: 2, pb: 3 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: dt.accent.main }} />
                  {i < versions.length - 1 && (
                    <Box sx={{ width: 2, flex: 1, bgcolor: dt.border.default }} />
                  )}
                </Box>
                <Card sx={{ flex: 1 }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="subtitle1" fontWeight={600}>
                        v{v.version}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatFullDate(v.date)}
                      </Typography>
                      {v.rating && (
                        <Chip
                          label={`评分 ${v.rating.toFixed(1)}`}
                          size="small"
                          sx={{
                            ml: 1,
                            height: 22,
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            bgcolor: alpha(dt.warning.main, 0.1),
                            color: dt.warning.dark,
                          }}
                        />
                      )}
                    </Box>
                    {v.releaseNotes && (
                      <Typography
                        variant="body2"
                        sx={{
                          mt: 1,
                          color: dt.text.secondary,
                          whiteSpace: 'pre-line',
                          lineHeight: 1.6,
                        }}
                      >
                        {v.releaseNotes.slice(0, 200)}
                        {v.releaseNotes.length > 200 ? '...' : ''}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Box>
            ))
          )}
        </Box>
      )}

      {/* ═══ Tab 3: News Feed ═══ */}
      {activeTab === 3 && (
        <Box>
          {/* Time range filter */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <ToggleButtonGroup
              value={newsDays}
              exclusive
              onChange={(_, v) => { if (v !== null) { setNewsDays(v); setNewsPage(1); } }}
              size="small"
            >
              <ToggleButton value={7} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>7天</ToggleButton>
              <ToggleButton value={30} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>30天</ToggleButton>
              <ToggleButton value={90} sx={{ px: 1.5, py: 0.25, fontSize: '0.75rem' }}>90天</ToggleButton>
            </ToggleButtonGroup>
            <Typography variant="body2" sx={{ color: dt.text.muted }}>
              共 <Box component="span" sx={{ color: dt.text.primary, fontWeight: 600 }}>{newsPagination.total}</Box> 条
            </Typography>
          </Box>

          {newsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} />
            </Box>
          ) : newsItems.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 8 }}>
                <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
                  暂无新闻动态
                </Typography>
                <Typography variant="body2" sx={{ color: dt.text.muted }}>
                  新闻与网页变更将在采集后自动出现
                </Typography>
              </CardContent>
            </Card>
          ) : (
            <Stack spacing={1.5}>
              {newsItems.map((item) => (
                <Card
                  key={item.id}
                  sx={{
                    borderLeft: item.isHighImpact ? `3px solid ${dt.danger.main}` : 'none',
                  }}
                >
                  <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                      {getSourceChip(item.type, item.source)}
                      {item.isHighImpact && (
                        <Chip label="高影响" size="small" color="error" variant="outlined" sx={{ fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                      )}
                      <Typography variant="caption" sx={{ color: dt.text.muted, ml: 'auto' }}>
                        {formatRelativeTime(item.createdAt)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="subtitle2"
                      sx={{
                        color: dt.text.primary,
                        fontWeight: 600,
                        mb: 0.5,
                        ...(item.url && item.type === 'news' ? {
                          cursor: 'pointer',
                          '&:hover': { color: dt.accent.main },
                        } : {}),
                      }}
                      onClick={() => {
                        if (item.url && item.type === 'news') window.open(item.url, '_blank');
                      }}
                    >
                      {item.title}
                    </Typography>
                    {item.summary && (
                      <Typography variant="body2" sx={{ color: dt.text.secondary, lineHeight: 1.6 }}>
                        {item.summary.length > 200 ? item.summary.slice(0, 200) + '...' : item.summary}
                      </Typography>
                    )}
                    {item.url && (
                      <Typography
                        variant="caption"
                        component="a"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          display: 'inline-block',
                          mt: 0.75,
                          color: dt.accent.main,
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {item.type === 'news' ? '查看原文' : '查看页面'}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}

          {/* Pagination */}
          {newsPagination.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={newsPagination.totalPages}
                page={newsPage}
                onChange={(_, value) => setNewsPage(value)}
                color="primary"
                shape="rounded"
              />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
