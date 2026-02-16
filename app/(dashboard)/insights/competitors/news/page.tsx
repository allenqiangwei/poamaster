'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Typography, Box, Card, CardContent, Button, Chip, Alert,
  CircularProgress, Grid, Select, MenuItem, FormControl, InputLabel,
  ToggleButtonGroup, ToggleButton, Pagination,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────

interface NewsItem {
  id: string;
  type: 'news' | 'web_change';
  source: string;
  competitorName: string;
  title: string;
  summary: string | null;
  url: string | null;
  isHighImpact: boolean;
  createdAt: string;
}

interface CompetitorOption {
  id: string;
  name: string;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface NewsCountEntry {
  name: string;
  count: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

// ─── Component ───────────────────────────────────────────────

export default function CompetitorNewsPage() {
  const router = useRouter();

  // Filters
  const [competitorId, setCompetitorId] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [daysFilter, setDaysFilter] = useState<string>('7');
  const [page, setPage] = useState(1);

  // Data
  const [items, setItems] = useState<NewsItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [newsCountByCompetitor, setNewsCountByCompetitor] = useState<NewsCountEntry[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ─── Data Fetching ─────────────────────────────────────────

  const loadNews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (competitorId !== 'all') params.set('competitorId', competitorId);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (daysFilter !== 'all') params.set('days', daysFilter);
      params.set('page', String(page));

      const res = await fetch(`/api/competitors/news?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (data.success !== false) {
        setItems(data.items || []);
        setPagination(data.pagination || null);
        setNewsCountByCompetitor(data.newsCountByCompetitor || []);
        if (data.competitors) setCompetitors(data.competitors);
      } else {
        setError(data.error || '加载失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [competitorId, typeFilter, daysFilter, page]);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [competitorId, typeFilter, daysFilter]);

  // ─── Derived Data ──────────────────────────────────────────

  const highImpactItems = items.filter((item) => item.isHighImpact);

  // ─── Render ────────────────────────────────────────────────

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Button
          startIcon={<BackIcon />}
          onClick={() => router.push('/insights/competitors')}
          sx={{
            color: dt.text.secondary,
            fontWeight: 500,
            mb: 2,
            px: 1,
            '&:hover': {
              color: dt.accent.main,
              bgcolor: dt.accent.subtle,
            },
          }}
        >
          返回竞品监控
        </Button>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            color: dt.text.primary,
            letterSpacing: '-0.02em',
          }}
        >
          新闻与动态
        </Typography>
      </Box>

      {/* Filter Bar */}
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        mb: 3,
        flexWrap: 'wrap',
      }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>竞品</InputLabel>
          <Select
            value={competitorId}
            label="竞品"
            onChange={(e) => setCompetitorId(e.target.value)}
          >
            <MenuItem value="all">全部</MenuItem>
            {competitors.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <ToggleButtonGroup
          value={typeFilter}
          exclusive
          onChange={(_, val) => val && setTypeFilter(val)}
          size="small"
        >
          <ToggleButton value="all">全部</ToggleButton>
          <ToggleButton value="news">新闻</ToggleButton>
          <ToggleButton value="web_change">网页变更</ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup
          value={daysFilter}
          exclusive
          onChange={(_, val) => val && setDaysFilter(val)}
          size="small"
        >
          <ToggleButton value="7">7天</ToggleButton>
          <ToggleButton value="30">30天</ToggleButton>
          <ToggleButton value="all">全部</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {/* Left — Feed */}
          <Grid size={{ xs: 12, md: 8 }}>
            {items.length === 0 ? (
              <Card>
                <CardContent sx={{ textAlign: 'center', py: 8 }}>
                  <Typography variant="body1" sx={{ color: dt.text.muted }}>
                    暂无新闻与动态
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              <>
                {items.map((item) => (
                  <Card key={item.id} sx={{
                    mb: 1.5,
                    borderLeft: item.isHighImpact ? `4px solid ${dt.danger.main}` : 'none',
                  }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}>
                        <Chip
                          label={item.type === 'news' ? 'Google Search' : item.source}
                          size="small"
                          color={item.type === 'news' ? 'primary' : 'warning'}
                          variant="outlined"
                        />
                        <Chip label={item.competitorName} size="small" variant="outlined" />
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                          {formatRelativeTime(item.createdAt)}
                        </Typography>
                      </Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {item.url && item.type === 'news' ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'inherit', textDecoration: 'none' }}
                          >
                            {item.title}
                          </a>
                        ) : item.title}
                      </Typography>
                      {item.summary && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {item.summary.slice(0, 200)}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                    <Pagination
                      count={pagination.totalPages}
                      page={pagination.page}
                      onChange={(_, value) => setPage(value)}
                      color="primary"
                    />
                  </Box>
                )}
              </>
            )}
          </Grid>

          {/* Right — Statistics */}
          <Grid size={{ xs: 12, md: 4 }}>
            {/* News Distribution Bar Chart */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Typography
                  variant="subtitle1"
                  sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}
                >
                  近7天新闻分布
                </Typography>
                {newsCountByCompetitor.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={newsCountByCompetitor}
                      margin={{ top: 5, right: 10, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                      <XAxis
                        dataKey="name"
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
                      />
                      <Bar dataKey="count" fill={dt.accent.main} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Typography variant="body2" sx={{ color: dt.text.muted, textAlign: 'center', py: 4 }}>
                    暂无数据
                  </Typography>
                )}
              </CardContent>
            </Card>

            {/* High Impact Events */}
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <WarningIcon sx={{ fontSize: 18, color: dt.danger.main }} />
                  <Typography
                    variant="subtitle1"
                    sx={{ color: dt.text.primary, fontWeight: 600 }}
                  >
                    高影响事件
                  </Typography>
                </Box>
                {highImpactItems.length > 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {highImpactItems.map((item) => (
                      <Box
                        key={item.id}
                        sx={{
                          borderLeft: `3px solid ${dt.danger.main}`,
                          pl: 1.5,
                          py: 0.75,
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600, color: dt.text.primary, lineHeight: 1.4 }}
                        >
                          {item.title}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                          <Typography variant="caption" sx={{ color: dt.text.muted }}>
                            {item.competitorName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: dt.text.muted }}>
                            {formatRelativeTime(item.createdAt)}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2" sx={{ color: dt.text.muted, textAlign: 'center', py: 3 }}>
                    暂无高影响事件
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
