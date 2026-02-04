'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckIcon,
  HourglassEmpty as ProcessingIcon,
  Description as MaterialIcon,
  AttachFile as AttachmentIcon
} from '@mui/icons-material';
import DiscussionReport from '@/components/roundtable/DiscussionReport';

export default function DiscussionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const discussionId = params.id as string;

  const [discussion, setDiscussion] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDiscussion();
    const interval = setInterval(() => {
      if (discussion?.status === 'processing') {
        fetchDiscussion();
      }
    }, 5000); // 每5秒刷新一次处理中的讨论

    return () => clearInterval(interval);
  }, [discussionId, discussion?.status]);

  const fetchDiscussion = async () => {
    try {
      const res = await fetch(`/api/roundtable/discussions/${discussionId}`);
      if (!res.ok) throw new Error('Failed to fetch discussion');
      const data = await res.json();
      setDiscussion(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    alert('PDF导出功能将在后续版本实现');
  };

  const handleSendToFeishu = async () => {
    alert('发送到飞书功能将在后续版本实现');
  };

  const handleCreateTask = async (actionId: string) => {
    try {
      const res = await fetch(`/api/roundtable/actions/${actionId}/create-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error('Failed to create task');

      const task = await res.json();
      await fetchDiscussion();
      alert(`任务创建成功！任务ID: ${task.id}`);
    } catch (err) {
      alert('创建任务失败: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error">{error}</Alert>
        <Button onClick={() => router.push('/roundtable')} sx={{ mt: 2 }}>
          返回列表
        </Button>
      </Box>
    );
  }

  if (!discussion) {
    return <Alert severity="error">讨论不存在</Alert>;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Button
            startIcon={<BackIcon />}
            onClick={() => router.push('/roundtable')}
          >
            返回
          </Button>
          <Typography variant="h5">{discussion.title}</Typography>
          <Chip
            label={discussion.status === 'completed' ? '已完成' : discussion.status === 'processing' ? '处理中' : '失败'}
            color={discussion.status === 'completed' ? 'success' : discussion.status === 'processing' ? 'primary' : 'error'}
          />
        </Box>
        {discussion.status === 'processing' && (
          <Button
            startIcon={<RefreshIcon />}
            onClick={fetchDiscussion}
          >
            刷新
          </Button>
        )}
      </Box>

      {/* 提交的材料 */}
      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <MaterialIcon />
            <Typography variant="h6">提交的材料</Typography>
            {discussion.attachments && discussion.attachments.length > 0 && (
              <Chip label={`${discussion.attachments.length}个附件`} size="small" />
            )}
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {/* 文本材料 */}
          {discussion.materialText && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                文本材料
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: 'grey.50',
                  maxHeight: 400,
                  overflow: 'auto'
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }}
                >
                  {discussion.materialText}
                </Typography>
              </Paper>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {discussion.materialText.length} 字符
              </Typography>
            </Box>
          )}

          {/* 附件列表 */}
          {discussion.attachments && discussion.attachments.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="primary" gutterBottom>
                附件 ({discussion.attachments.length})
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {discussion.attachments.map((attachment: any) => (
                  <Paper
                    key={attachment.id}
                    variant="outlined"
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2
                    }}
                  >
                    <AttachmentIcon color="action" />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" fontWeight="medium">
                        {attachment.filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {attachment.filetype.toUpperCase()} · {(attachment.filesize / 1024).toFixed(1)} KB
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      href={attachment.filepath}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      查看
                    </Button>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}

          {!discussion.materialText && (!discussion.attachments || discussion.attachments.length === 0) && (
            <Alert severity="info">
              未提交任何材料
            </Alert>
          )}
        </AccordionDetails>
      </Accordion>

      {discussion.status === 'processing' && (
        <>
          <Alert severity="info" sx={{ mb: 3 }}>
            讨论正在进行中，预计需要3-5分钟。您可以离开页面，完成后会收到飞书通知。
          </Alert>

          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              讨论进展
            </Typography>

            <Stepper activeStep={discussion.rounds?.length || 0} orientation="vertical" sx={{ mt: 2 }}>
              {[
                { label: '回合1：澄清回合', description: '各角色提出澄清问题' },
                { label: '回合2：质疑回合', description: '识别风险和数据缺失' },
                { label: '回合3：反驳回合', description: '各角色提出反驳或替代方案' },
                { label: '回合4：裁决回合', description: '主持人做出最终裁决' }
              ].map((step, index) => {
                const round = discussion.rounds?.find((r: any) => r.roundNumber === index + 1);
                const isCompleted = !!round;
                const isActive = index === (discussion.rounds?.length || 0);

                return (
                  <Step key={index} completed={isCompleted}>
                    <StepLabel
                      icon={isCompleted ? <CheckIcon color="success" /> : isActive ? <ProcessingIcon color="primary" /> : undefined}
                    >
                      <Box>
                        <Typography variant="subtitle1" fontWeight={isActive ? 'bold' : 'normal'}>
                          {step.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {step.description}
                        </Typography>
                      </Box>
                    </StepLabel>
                  </Step>
                );
              })}
            </Stepper>

            {/* 显示已完成的回合内容 */}
            {discussion.rounds && discussion.rounds.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                  已完成的回合
                </Typography>
                {discussion.rounds.map((round: any) => (
                  <Accordion key={round.id} sx={{ mb: 1 }}>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckIcon color="success" fontSize="small" />
                        <Typography>
                          回合{round.roundNumber}：
                          {round.roundType === 'clarify' && '澄清回合'}
                          {round.roundType === 'question' && '质疑回合'}
                          {round.roundType === 'rebuttal' && '反驳回合'}
                          {round.roundType === 'verdict' && '裁决回合'}
                        </Typography>
                        <Chip label={`${round.messages?.length || 0}条消息`} size="small" />
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      {round.messages?.map((message: any, idx: number) => (
                        <Box key={message.id} sx={{ mb: 2 }}>
                          {idx > 0 && <Divider sx={{ my: 2 }} />}
                          <Typography variant="subtitle2" color="primary" gutterBottom>
                            {message.roleName}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ whiteSpace: 'pre-wrap', pl: 2, borderLeft: 2, borderColor: 'divider' }}
                          >
                            {message.content}
                          </Typography>
                        </Box>
                      ))}
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Box>
            )}
          </Paper>
        </>
      )}

      {discussion.status === 'failed' && (
        <Alert severity="error" sx={{ mb: 3 }}>
          讨论处理失败：{discussion.errorMessage}
        </Alert>
      )}

      {discussion.status === 'completed' && (
        <DiscussionReport
          discussion={discussion}
          onExportPDF={handleExportPDF}
          onSendToFeishu={handleSendToFeishu}
          onCreateTask={handleCreateTask}
        />
      )}
    </Box>
  );
}
