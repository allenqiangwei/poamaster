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
} from '@mui/icons-material';

interface DiscussionReportProps {
  discussion: any;
  onExportPDF?: () => void;
  onSendToFeishu?: () => void;
  onCreateTask?: (actionId: string) => void;
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
        <Typography variant="body1">
          {discussion.conclusion}
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
                  primary={action.content}
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
                      <Typography variant="body2">{risk.description}</Typography>
                    </Box>
                  }
                  secondary={
                    <Box component="span">
                      <Typography variant="caption" display="block">
                        影响：{risk.impact}
                      </Typography>
                      {risk.mitigation && (
                        <Typography variant="caption" display="block">
                          缓解：{risk.mitigation}
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
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>
                    {message.content}
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
                    primary={assumption.description}
                    secondary={`置信度：${assumption.confidence} | 依据：${assumption.reasoning}`}
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
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {discussion.decisionReasoning}
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
