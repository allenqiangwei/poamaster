'use client';

import {
  Box,
  Paper,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  Download as DownloadIcon,
  Send as SendIcon,
  Task as TaskIcon,
  FormatQuote as QuoteIcon,
} from '@mui/icons-material';

interface DiscussionReportProps {
  discussion: any;
  onExportPDF?: () => void;
  onSendToFeishu?: () => void;
  onCreateTask?: (actionId: string) => void;
}

/**
 * 高亮显示文本中的引用内容
 * 检测以下模式：
 * - "材料中提到..."、"材料显示..."、"根据材料..."
 * - 引号中的文本（可能是直接引用）
 */
function highlightCitations(text: string): React.ReactNode {
  if (!text) return text;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // 匹配引用模式：材料中提到、材料显示、根据材料等
  const citationPattern = /(材料中提到|材料显示|材料中|根据材料|材料提及)([^。！？]*[。！？])/g;

  // 先处理明确的引用模式
  let match;
  const matches: Array<{ start: number; end: number; text: string }> = [];

  while ((match = citationPattern.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      text: match[0]
    });
  }

  // 如果找到引用，添加高亮
  if (matches.length > 0) {
    matches.forEach((m, idx) => {
      // 添加引用前的普通文本
      if (m.start > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {text.substring(lastIndex, m.start)}
          </span>
        );
      }

      // 添加高亮的引用文本
      parts.push(
        <Box
          component="span"
          key={`citation-${idx}`}
          sx={{
            bgcolor: 'warning.light',
            px: 0.5,
            py: 0.25,
            borderRadius: 0.5,
            fontWeight: 'medium',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <QuoteIcon sx={{ fontSize: 14, color: 'warning.dark' }} />
          {m.text}
        </Box>
      );

      lastIndex = m.end;
    });

    // 添加最后剩余的文本
    if (lastIndex < text.length) {
      parts.push(
        <span key="text-end">
          {text.substring(lastIndex)}
        </span>
      );
    }

    return <>{parts}</>;
  }

  // 如果没有找到引用模式，返回原文
  return text;
}

export default function DiscussionReport({
  discussion,
  onExportPDF,
  onSendToFeishu,
  onCreateTask,
}: DiscussionReportProps) {
  const getConclusionColor = (type: string) => {
    switch (type) {
      case 'pass': return 'success';
      case 'conditional_pass': return 'warning';
      case 'reject': return 'error';
      default: return 'info';
    }
  };

  const getConclusionLabel = (type: string) => {
    switch (type) {
      case 'pass': return '通过';
      case 'conditional_pass': return '有条件通过';
      case 'reject': return '打回';
      case 'need_more_info': return '需补充信息';
      default: return type;
    }
  };

  return (
    <Box>
      {/* 结论摘要 */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
          <Typography variant="h5">裁决结论</Typography>
          <Chip
            label={getConclusionLabel(discussion.conclusionType)}
            color={getConclusionColor(discussion.conclusionType)}
          />
        </Box>
        <Typography variant="body1" component="div">
          {highlightCitations(discussion.conclusion)}
        </Typography>
      </Paper>

      {/* 核心信息区 */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mb: 3 }}>
        {/* 行动清单 */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            行动清单
          </Typography>
          <List>
            {discussion.actions?.map((action: any) => (
              <ListItem
                key={action.id}
                secondaryAction={
                  !action.taskId && onCreateTask && (
                    <Button
                      size="small"
                      startIcon={<TaskIcon />}
                      onClick={() => onCreateTask(action.id)}
                    >
                      创建任务
                    </Button>
                  )
                }
              >
                <ListItemText
                  primary={<Box component="div">{highlightCitations(action.content)}</Box>}
                  secondary={
                    <Box component="span">
                      {action.assignee && `负责人：${action.assignee} | `}
                      {action.deadline && `截止：${new Date(action.deadline).toLocaleDateString('zh-CN')} | `}
                      <Chip
                        label={action.priority}
                        size="small"
                        color={action.priority === 'high' ? 'error' : action.priority === 'medium' ? 'warning' : 'default'}
                      />
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>

        {/* 风险清单 */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            风险清单
          </Typography>
          <List>
            {discussion.risks?.map((risk: any) => (
              <ListItem key={risk.id}>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={risk.priority}
                        size="small"
                        color={risk.priority === 'high' ? 'error' : risk.priority === 'medium' ? 'warning' : 'default'}
                      />
                      <Typography variant="body2" component="div">
                        {highlightCitations(risk.description)}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Box component="div">
                      <Typography variant="caption" display="block" component="div">
                        影响：{highlightCitations(risk.impact)}
                      </Typography>
                      {risk.mitigation && (
                        <Typography variant="caption" display="block" component="div">
                          缓解：{highlightCitations(risk.mitigation)}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>

      {/* 讨论过程 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          讨论过程
        </Typography>
        {discussion.rounds?.map((round: any) => (
          <Accordion key={round.id}>
            <AccordionSummary expandIcon={<ExpandIcon />}>
              <Typography>
                回合{round.roundNumber}：
                {round.roundType === 'clarify' ? '澄清' :
                 round.roundType === 'question' ? '质疑' :
                 round.roundType === 'rebuttal' ? '反驳' : '裁决'}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {round.messages?.map((message: any) => (
                <Box key={message.id} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" color="primary.main">
                    {message.roleName}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }} component="div">
                    {highlightCitations(message.content)}
                  </Typography>
                  <Divider sx={{ mt: 2 }} />
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      {/* 附加信息 */}
      {discussion.assumptions && discussion.assumptions.length > 0 && (
        <Accordion sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandIcon />}>
            <Typography>假设说明</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {discussion.assumptions.map((assumption: any) => (
                <ListItem key={assumption.id}>
                  <ListItemText
                    primary={<Box component="div">{highlightCitations(assumption.description)}</Box>}
                    secondary={
                      <Box component="div">
                        置信度：{assumption.confidence} | 依据：{highlightCitations(assumption.reasoning)}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}

      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandIcon />}>
          <Typography>决策依据</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }} component="div">
            {highlightCitations(discussion.decisionReasoning)}
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* 操作栏 */}
      <Box sx={{ display: 'flex', gap: 2, mt: 4 }}>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={onExportPDF}
        >
          导出PDF
        </Button>
        <Button
          variant="outlined"
          startIcon={<SendIcon />}
          onClick={onSendToFeishu}
        >
          发送到飞书
        </Button>
      </Box>
    </Box>
  );
}
