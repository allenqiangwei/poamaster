'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Autocomplete,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useRouter, useSearchParams } from 'next/navigation';
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

// ─── Types ────────────────────────────────────────────────────

interface CompetitorOption {
  id: string;
  name: string;
}

interface RatingTrendItem {
  date: string;
  [competitorName: string]: string | number | null;
}

interface SentimentItem {
  name: string;
  positive: number;
  neutral: number;
  negative: number;
}

interface VolumeItem {
  name: string;
  good: number;
  neutral: number;
  bad: number;
}

interface HeatmapRow {
  tag: string;
  [competitorName: string]: string | number;
}

interface CompareData {
  competitors: CompetitorOption[];
  ratingTrend: RatingTrendItem[];
  sentimentData: SentimentItem[];
  volumeData: VolumeItem[];
  heatmapData: HeatmapRow[];
}

// ─── Constants ────────────────────────────────────────────────

const COLORS = [
  dt.accent.main, dt.teal.main, dt.purple.main, '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#14B8A6',
];

const SENTIMENT_COLORS = {
  positive: '#22C55E',
  neutral: '#9CA3AF',
  negative: '#EF4444',
};

const RANGE_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
];

// ─── CompareContent (uses useSearchParams) ────────────────────

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-driven state
  const initialIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];
  const initialRange = Number(searchParams.get('range')) || 30;

  // State
  const [allCompetitors, setAllCompetitors] = useState<CompetitorOption[]>([]);
  const [selectedCompetitors, setSelectedCompetitors] = useState<CompetitorOption[]>([]);
  const [range, setRange] = useState<number>(initialRange);
  const [loading, setLoading] = useState(true);
  const [compareLoading, setCompareLoading] = useState(false);

  // Compare data
  const [compareData, setCompareData] = useState<CompareData | null>(null);

  // ─── URL Persistence ──────────────────────────────────────

  const updateUrl = useCallback((ids: string[], days: number) => {
    const params = new URLSearchParams();
    if (ids.length > 0) params.set('ids', ids.join(','));
    if (days !== 30) params.set('range', String(days));
    const qs = params.toString();
    router.replace(`/insights/competitors/compare${qs ? `?${qs}` : ''}`);
  }, [router]);

  // ─── Fetch competitor list ────────────────────────────────

  useEffect(() => {
    const fetchCompetitors = async () => {
      try {
        const res = await fetch('/api/competitors', { credentials: 'include' });
        const data = await res.json();
        if (data.success && data.competitors) {
          const options: CompetitorOption[] = data.competitors.map(
            (c: { id: string; name: string }) => ({ id: c.id, name: c.name })
          );
          setAllCompetitors(options);

          // Restore selection from URL
          if (initialIds.length > 0) {
            const restored = options.filter((o) => initialIds.includes(o.id));
            setSelectedCompetitors(restored);
          }
        }
      } catch {
        /* silently fail */
      } finally {
        setLoading(false);
      }
    };
    fetchCompetitors();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Fetch compare data ───────────────────────────────────

  useEffect(() => {
    if (selectedCompetitors.length < 2) {
      setCompareData(null);
      return;
    }

    const fetchCompare = async () => {
      setCompareLoading(true);
      try {
        const ids = selectedCompetitors.map((c) => c.id).join(',');
        const res = await fetch(
          `/api/competitors/compare?ids=${ids}&days=${range}`,
          { credentials: 'include' }
        );
        const data = await res.json();
        if (data) {
          setCompareData(data);
        }
      } catch {
        /* silently fail */
      } finally {
        setCompareLoading(false);
      }
    };
    fetchCompare();
  }, [selectedCompetitors, range]);

  // ─── Handlers ─────────────────────────────────────────────

  const handleCompetitorChange = (_: unknown, value: CompetitorOption[]) => {
    setSelectedCompetitors(value);
    updateUrl(value.map((c) => c.id), range);
  };

  const handleRangeChange = (_: unknown, newRange: number | null) => {
    if (newRange === null) return;
    setRange(newRange);
    updateUrl(selectedCompetitors.map((c) => c.id), newRange);
  };

  // ─── Helpers ──────────────────────────────────────────────

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const competitorNames = selectedCompetitors.map((c) => c.name);

  // Heatmap max value
  const maxValue = compareData?.heatmapData
    ? Math.max(
        ...compareData.heatmapData.flatMap((row) =>
          competitorNames.map((name) => (typeof row[name] === 'number' ? (row[name] as number) : 0))
        ),
        1
      )
    : 1;

  // ─── Loading ──────────────────────────────────────────────

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push('/insights/competitors')}
          variant="text"
          size="small"
          sx={{ color: dt.text.secondary }}
        >
          返回
        </Button>
        <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700 }}>
          竞品对比
        </Typography>
      </Box>

      {/* Competitor Selector + Time Range */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ py: 2.5, '&:last-child': { pb: 2.5 } }}>
          <Box sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2,
            alignItems: { md: 'center' },
          }}>
            <Autocomplete
              multiple
              options={allCompetitors}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={selectedCompetitors}
              onChange={handleCompetitorChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder={selectedCompetitors.length === 0 ? '选择竞品（至少2个）' : ''}
                  size="small"
                />
              )}
              sx={{ flex: 1, minWidth: 300 }}
              noOptionsText="暂无竞品"
            />
            <Box sx={{ flexShrink: 0 }}>
              <ToggleButtonGroup
                value={range}
                exclusive
                onChange={handleRangeChange}
                size="small"
              >
                {RANGE_OPTIONS.map((opt) => (
                  <ToggleButton key={opt.value} value={opt.value} sx={{ px: 2 }}>
                    {opt.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Prompt when fewer than 2 selected */}
      {selectedCompetitors.length < 2 && (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 8 }}>
            <CompareArrowsIcon sx={{ fontSize: 64, color: dt.text.muted, mb: 2 }} />
            <Typography variant="h6" sx={{ color: dt.text.secondary, mb: 1 }}>
              请选择至少 2 个竞品进行对比
            </Typography>
            <Typography variant="body2" sx={{ color: dt.text.muted }}>
              从上方选择器中添加竞品，系统将自动生成对比分析
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* Loading state for compare data */}
      {selectedCompetitors.length >= 2 && compareLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Charts — only when 2+ competitors and data loaded */}
      {selectedCompetitors.length >= 2 && !compareLoading && compareData && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* 1. Rating Trend Line Chart */}
          {compareData.ratingTrend && compareData.ratingTrend.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  评分趋势对比
                </Typography>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={compareData.ratingTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
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
                    <Legend />
                    {competitorNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={COLORS[i % COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* 2. Sentiment Distribution Bar Chart */}
          {compareData.sentimentData && compareData.sentimentData.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  情感分布对比
                </Typography>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={compareData.sentimentData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: dt.text.secondary, fontSize: 13 }}
                      stroke={dt.border.default}
                    />
                    <YAxis
                      tick={{ fill: dt.text.muted, fontSize: 12 }}
                      stroke={dt.border.default}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: dt.bg.elevated,
                        border: `1px solid ${dt.border.default}`,
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => `${value}%`}
                    />
                    <Legend />
                    <Bar dataKey="positive" name="正面" fill={SENTIMENT_COLORS.positive} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="neutral" name="中性" fill={SENTIMENT_COLORS.neutral} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="negative" name="负面" fill={SENTIMENT_COLORS.negative} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* 3. Review Volume Bar Chart */}
          {compareData.volumeData && compareData.volumeData.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  评论量对比
                </Typography>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={compareData.volumeData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={dt.border.default} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: dt.text.secondary, fontSize: 13 }}
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
                    <Legend />
                    <Bar dataKey="good" name="好评" fill={SENTIMENT_COLORS.positive} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="neutral" name="中评" fill={SENTIMENT_COLORS.neutral} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="bad" name="差评" fill={SENTIMENT_COLORS.negative} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* 4. Issue Heatmap Table */}
          {compareData.heatmapData && compareData.heatmapData.length > 0 && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ color: dt.text.primary, fontWeight: 600, mb: 2 }}>
                  关键问题热力图
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ minWidth: 120 }}>问题标签</TableCell>
                        {competitorNames.map((name) => (
                          <TableCell key={name} sx={{ textAlign: 'center' }}>
                            {name}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {compareData.heatmapData.map((row) => (
                        <TableRow key={row.tag}>
                          <TableCell sx={{ fontWeight: 600 }}>{row.tag}</TableCell>
                          {competitorNames.map((name) => {
                            const value = (typeof row[name] === 'number' ? row[name] : 0) as number;
                            const intensity = maxValue > 0 ? value / maxValue : 0;
                            return (
                              <TableCell
                                key={name}
                                sx={{
                                  bgcolor: `rgba(239, 68, 68, ${intensity * 0.7})`,
                                  color: intensity > 0.5 ? '#fff' : 'inherit',
                                  textAlign: 'center',
                                  fontWeight: 600,
                                }}
                              >
                                {value || '-'}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── Page Export (Suspense boundary) ──────────────────────────

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      }
    >
      <CompareContent />
    </Suspense>
  );
}
