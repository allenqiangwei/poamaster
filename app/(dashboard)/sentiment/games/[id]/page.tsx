'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  CircularProgress,
  Stack,
  Pagination,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt';
import SentimentNeutralIcon from '@mui/icons-material/SentimentNeutral';
import SentimentVeryDissatisfiedIcon from '@mui/icons-material/SentimentVeryDissatisfied';
import AppleIcon from '@mui/icons-material/Apple';
import AndroidIcon from '@mui/icons-material/Android';
import { useRouter, useParams } from 'next/navigation';
import { designTokens as dt } from '@/lib/theme';

interface Game {
  id: string;
  name: string;
  appStoreId: string | null;
  googlePlayId: string | null;
  _count: {
    reviews: number;
    mentions: number;
    alerts: number;
  };
}

interface Review {
  id: string;
  platform: string;
  author: string | null;
  rating: number;
  title: string | null;
  content: string;
  sentimentLabel: string | null;
  keyIssues: string[];
  publishedAt: string;
}

export default function GameDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };

  const [game, setGame] = useState<Game | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState<string>('');
  const [sentiment, setSentiment] = useState<string>('');

  // Fetch game info
  useEffect(() => {
    const fetchGame = async () => {
      try {
        const res = await fetch(`/api/sentiment/games/${id}`);
        const data = await res.json();
        if (data.success) {
          setGame(data.game);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchGame();
  }, [id]);

  // Fetch reviews
  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
      });
      if (platform) params.set('platform', platform);
      if (sentiment) params.set('sentiment', sentiment);

      const res = await fetch(`/api/sentiment/games/${id}/reviews?${params}`);
      const data = await res.json();
      if (data.success) {
        setReviews(data.reviews);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch {
      // silently fail
    } finally {
      setReviewsLoading(false);
    }
  }, [id, page, platform, sentiment]);

  useEffect(() => {
    if (!loading) {
      fetchReviews();
    }
  }, [fetchReviews, loading]);

  const handlePlatformChange = (_: React.MouseEvent<HTMLElement>, value: string | null) => {
    setPlatform(value || '');
    setPage(1);
  };

  const handleSentimentChange = (_: React.MouseEvent<HTMLElement>, value: string | null) => {
    setSentiment(value || '');
    setPage(1);
  };

  const getSentimentIcon = (label: string | null) => {
    switch (label) {
      case 'POSITIVE':
        return <SentimentSatisfiedAltIcon sx={{ fontSize: 18, color: dt.success.main }} />;
      case 'NEUTRAL':
        return <SentimentNeutralIcon sx={{ fontSize: 18, color: dt.warning.main }} />;
      case 'NEGATIVE':
        return <SentimentVeryDissatisfiedIcon sx={{ fontSize: 18, color: dt.danger.main }} />;
      default:
        return null;
    }
  };

  const getPlatformChip = (p: string) => {
    if (p === 'APP_STORE') {
      return (
        <Chip
          icon={<AppleIcon sx={{ fontSize: 12 }} />}
          label="App Store"
          size="small"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.65rem' }}
        />
      );
    }
    return (
      <Chip
        icon={<AndroidIcon sx={{ fontSize: 12 }} />}
        label="Google Play"
        size="small"
        variant="outlined"
        sx={{ height: 20, fontSize: '0.65rem', borderColor: dt.success.main, color: dt.success.main }}
      />
    );
  };

  const renderStars = (rating: number) => {
    return (
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
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!game) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" sx={{ color: dt.text.secondary }}>
          游戏不存在
        </Typography>
        <Button sx={{ mt: 2 }} onClick={() => router.push('/sentiment')}>
          返回舆情监控
        </Button>
      </Box>
    );
  }

  const hasAppStore = !!game.appStoreId;
  const hasGooglePlay = !!game.googlePlayId;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <IconButton onClick={() => router.push('/sentiment')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ color: dt.text.primary, fontWeight: 700 }}>
          {game.name}
        </Typography>
        <Chip
          label={`${game._count.reviews} 条评论`}
          size="small"
          sx={{
            bgcolor: alpha(dt.accent.main, 0.08),
            color: dt.accent.dark,
            fontWeight: 600,
          }}
        />
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            {/* Platform filter */}
            <Box>
              <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                平台
              </Typography>
              <ToggleButtonGroup
                value={platform || null}
                exclusive
                onChange={handlePlatformChange}
                size="small"
              >
                <ToggleButton value={null as unknown as string} sx={{ px: 2 }}>
                  全部
                </ToggleButton>
                {hasAppStore && (
                  <ToggleButton value="APP_STORE" sx={{ px: 2 }}>
                    App Store
                  </ToggleButton>
                )}
                {hasGooglePlay && (
                  <ToggleButton value="GOOGLE_PLAY" sx={{ px: 2 }}>
                    Google Play
                  </ToggleButton>
                )}
              </ToggleButtonGroup>
            </Box>

            {/* Sentiment filter */}
            <Box>
              <Typography variant="caption" sx={{ color: dt.text.muted, mb: 0.5, display: 'block' }}>
                情感
              </Typography>
              <ToggleButtonGroup
                value={sentiment || null}
                exclusive
                onChange={handleSentimentChange}
                size="small"
              >
                <ToggleButton value={null as unknown as string} sx={{ px: 2 }}>
                  全部
                </ToggleButton>
                <ToggleButton value="POSITIVE" sx={{ px: 2 }}>
                  正面
                </ToggleButton>
                <ToggleButton value="NEUTRAL" sx={{ px: 2 }}>
                  中性
                </ToggleButton>
                <ToggleButton value="NEGATIVE" sx={{ px: 2 }}>
                  负面
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            {/* Count display */}
            <Box sx={{ ml: { sm: 'auto' }, textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography variant="body2" sx={{ color: dt.text.muted }}>
                共 <Box component="span" sx={{ color: dt.text.primary, fontWeight: 600 }}>{total}</Box> 条结果
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Review List */}
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
              评论将在采集服务运行后自动出现
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={1.5}>
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
                {/* Row 1: stars, sentiment, platform, author + date */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  {renderStars(review.rating)}
                  {getSentimentIcon(review.sentimentLabel)}
                  {getPlatformChip(review.platform)}
                  <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {review.author && (
                      <Typography variant="caption" sx={{ color: dt.text.muted }}>
                        {review.author}
                      </Typography>
                    )}
                    <Typography variant="caption" sx={{ color: dt.text.muted }}>
                      {formatDate(review.publishedAt)}
                    </Typography>
                  </Box>
                </Box>

                {/* Title */}
                {review.title && (
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: dt.text.primary, mb: 0.5 }}
                  >
                    {review.title}
                  </Typography>
                )}

                {/* Content */}
                <Typography
                  variant="body2"
                  sx={{
                    color: dt.text.secondary,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.5,
                  }}
                >
                  {review.content}
                </Typography>

                {/* Key issues */}
                {review.keyIssues.length > 0 && (
                  <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                    {review.keyIssues.map((issue) => (
                      <Chip
                        key={issue}
                        label={issue}
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
                  </Stack>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, value) => setPage(value)}
            color="primary"
            shape="rounded"
          />
        </Box>
      )}
    </Box>
  );
}
