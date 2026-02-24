'use client';

export const dynamic = 'force-dynamic';

import { useRouter } from 'next/navigation';
import {
  Typography,
  Button,
  Box,
  Card,
  CardContent,
  Grid,
  Fade,
  alpha,
} from '@mui/material';
import {
  CheckBox as TodoIcon,
  Assessment as PulseIcon,
  Forum as RoundtableIcon,
  Chat as FeishuIcon,
  Insights as InsightsIcon,
  People as PeopleIcon,
  ArrowForward as ArrowIcon,
  MonitorHeart as MonitorHeartIcon,
  TravelExplore as CompetitorIcon,
} from '@mui/icons-material';
import { designTokens as dt } from '@/lib/theme';

const TOOLS = [
  {
    path: '/todo',
    title: '任务管理',
    desc: 'AI 驱动的任务管理，支持从文本、文件、图片中智能提取任务',
    icon: <TodoIcon />,
    color: dt.accent.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.accent.main, 0.08)} 0%, ${alpha(dt.accent.light, 0.03)} 100%)`,
    shadowColor: dt.accent.main,
  },
  {
    path: '/pulse',
    title: '项目管理',
    desc: '项目健康度追踪，多维度评估与风险预警系统',
    icon: <PulseIcon />,
    color: dt.purple.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.purple.main, 0.08)} 0%, ${alpha(dt.purple.dark, 0.03)} 100%)`,
    shadowColor: dt.purple.main,
  },
  {
    path: '/roundtable',
    title: '圆桌会议',
    desc: 'AI 多角色讨论系统，为决策提供全方位审查与建议',
    icon: <RoundtableIcon />,
    color: dt.success.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.success.main, 0.08)} 0%, ${alpha(dt.teal.main, 0.03)} 100%)`,
    shadowColor: dt.success.main,
  },
  {
    path: '/feishu',
    title: '飞书集成',
    desc: '实时监听飞书消息，自动采集群聊和私聊内容',
    icon: <FeishuIcon />,
    color: dt.teal.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.teal.main, 0.08)} 0%, ${alpha(dt.accent.light, 0.03)} 100%)`,
    shadowColor: dt.teal.main,
  },
  {
    path: '/insights',
    title: '每日简报',
    desc: 'AI 驱动的每日简报，自动汇总全平台数据动态',
    icon: <InsightsIcon />,
    color: dt.warning.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.warning.main, 0.08)} 0%, ${alpha(dt.warning.dark, 0.03)} 100%)`,
    shadowColor: dt.warning.main,
  },
  {
    path: '/sentiment',
    title: '舆情监控',
    desc: '自动采集 App Store、Google Play 评论，本地情感分析与趋势追踪',
    icon: <MonitorHeartIcon />,
    color: dt.danger.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.danger.main, 0.08)} 0%, ${alpha(dt.rose.main, 0.03)} 100%)`,
    shadowColor: dt.danger.main,
  },
  {
    path: '/insights/competitors',
    title: '竞品监控',
    desc: '监控竞品应用商店评分、官网变化、行业新闻，AI 自动分析竞品动态',
    icon: <CompetitorIcon />,
    color: dt.teal.dark || dt.teal.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.teal.main, 0.08)} 0%, ${alpha(dt.purple.dark, 0.03)} 100%)`,
    shadowColor: dt.teal.main,
  },
  {
    path: '/assignees',
    title: '团队管理',
    desc: '管理团队成员，查看个人任务与洞察',
    icon: <PeopleIcon />,
    color: dt.rose.main,
    gradient: `linear-gradient(135deg, ${alpha(dt.rose.main, 0.08)} 0%, ${alpha(dt.danger.main, 0.03)} 100%)`,
    shadowColor: dt.rose.main,
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function HomePage() {
  const router = useRouter();

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Hero */}
      <Fade in timeout={600}>
        <Box sx={{ mb: 5, pt: 2 }}>
          <Typography
            variant="h3"
            sx={{ fontWeight: 800, mb: 1, color: dt.text.primary }}
          >
            {getGreeting()}
          </Typography>
          <Typography variant="body1" sx={{ color: dt.text.muted, maxWidth: 480 }}>
            POA Master 集成任务管理、项目健康追踪、AI 圆桌会议、飞书消息监控于一体
          </Typography>
        </Box>
      </Fade>

      {/* Tool Cards */}
      <Grid container spacing={2.5}>
        {TOOLS.map((tool, i) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={tool.path}>
            <Fade in timeout={600 + i * 100}>
              <Card
                sx={{
                  cursor: 'pointer',
                  background: tool.gradient,
                  height: '100%',
                  position: 'relative',
                  overflow: 'hidden',
                  '&:hover': {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 32px ${alpha(tool.shadowColor, 0.15)}`,
                    '& .arrow-icon': { transform: 'translateX(4px)', opacity: 1 },
                  },
                }}
                onClick={() => router.push(tool.path)}
              >
                <CardContent sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: alpha(tool.color, 0.1),
                      color: tool.color,
                      mb: 2,
                    }}
                  >
                    {tool.icon}
                  </Box>
                  <Typography variant="h6" sx={{ mb: 1, color: dt.text.primary }}>
                    {tool.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: dt.text.secondary, mb: 2, flexGrow: 1 }}>
                    {tool.desc}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: tool.color, fontWeight: 600, fontSize: '0.82rem' }}
                    >
                      进入
                    </Typography>
                    <ArrowIcon
                      className="arrow-icon"
                      sx={{
                        fontSize: 16,
                        color: tool.color,
                        opacity: 0.5,
                        transition: 'all 0.2s',
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>
            </Fade>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
