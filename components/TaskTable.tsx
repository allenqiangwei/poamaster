'use client';

import { format, isToday, isWithinInterval, addDays } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Box,
  Typography,
  Chip,
  Card,
  CardContent,
  alpha,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as DoneIcon,
} from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';
import { designTokens as dt } from '@/lib/theme';
import { useResponsive } from '@/hooks/useResponsive';
import TaskStatusChip from './TaskStatusChip';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  assignee: { id: string; name: string } | null;
  dod: string | null;
}

interface TaskTableProps {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onMarkDone: (id: string) => void;
}

export default function TaskTable({
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  onMarkDone,
}: TaskTableProps) {
  const { isMobile } = useResponsive();

  const isOverdue = (dueDate: string | null, status: TaskStatus) => {
    if (!dueDate || status === 'DONE' || status === 'CANCELLED') return false;
    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate < today;
  };

  const getRowColor = (dueDate: string | null, status: TaskStatus) => {
    if (!dueDate || status === 'DONE' || status === 'CANCELLED') return 'transparent';

    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    if (taskDate < today) return alpha(dt.danger.main, 0.08);
    if (isToday(date)) return alpha(dt.danger.main, 0.05);

    const twoDaysLater = addDays(today, 2);
    if (isWithinInterval(date, { start: addDays(today, 1), end: twoDaysLater })) {
      return alpha(dt.warning.main, 0.06);
    }

    const sevenDaysLater = addDays(today, 7);
    if (isWithinInterval(date, { start: addDays(today, 3), end: sevenDaysLater })) {
      return alpha(dt.warning.main, 0.03);
    }

    return 'transparent';
  };

  if (tasks.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="body1" sx={{ color: dt.text.muted }}>
          暂无任务
        </Typography>
        <Typography variant="body2" sx={{ color: dt.text.muted, mt: 1 }}>
          点击"添加任务"开始使用
        </Typography>
      </Box>
    );
  }

  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {tasks.map((task) => (
          <Card
            key={task.id}
            sx={{
              bgcolor: getRowColor(task.dueDate, task.status),
            }}
          >
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color: dt.text.primary, mb: 0.5 }}>
                {task.title}
              </Typography>
              {task.dod && (
                <Typography variant="caption" sx={{ color: dt.text.muted, fontStyle: 'italic', display: 'block', mb: 1 }}>
                  {task.dod}
                </Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                {task.assignee && (
                  <Chip label={task.assignee.name} size="small" variant="outlined" />
                )}
                {task.dueDate && (
                  <Typography variant="caption" sx={{ color: dt.text.muted, fontFeatureSettings: '"tnum"' }}>
                    {format(new Date(task.dueDate), 'MM-dd HH:mm')}
                  </Typography>
                )}
                {isOverdue(task.dueDate, task.status) && (
                  <Chip label="逾期" color="error" size="small" sx={{ fontWeight: 700, height: 22 }} />
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <TaskStatusChip
                  status={task.status}
                  interactive
                  onChange={(s) => onStatusChange(task.id, s)}
                />
                <Box>
                  <IconButton size="small" onClick={() => onMarkDone(task.id)} title="标记完成">
                    <DoneIcon fontSize="small" sx={{ color: dt.success.main }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => onEdit(task)} title="编辑">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => onDelete(task.id)} title="删除" sx={{ color: dt.danger.main }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>任务标题</TableCell>
            <TableCell>负责人</TableCell>
            <TableCell>截止时间</TableCell>
            <TableCell>状态</TableCell>
            <TableCell align="right">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task) => (
            <TableRow
              key={task.id}
              sx={{ bgcolor: getRowColor(task.dueDate, task.status) }}
            >
              <TableCell>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: dt.text.primary }}>
                    {task.title}
                  </Typography>
                  {task.dod && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        mt: 0.5,
                        color: dt.text.muted,
                        fontStyle: 'italic',
                      }}
                    >
                      {task.dod}
                    </Typography>
                  )}
                </Box>
              </TableCell>
              <TableCell>{task.assignee?.name || '-'}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontFeatureSettings: '"tnum"' }}>
                    {task.dueDate
                      ? format(new Date(task.dueDate), 'yyyy-MM-dd HH:mm')
                      : '-'}
                  </Typography>
                  {isOverdue(task.dueDate, task.status) && (
                    <Chip
                      label="逾期"
                      color="error"
                      size="small"
                      sx={{ fontWeight: 700, height: 22 }}
                    />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <TaskStatusChip
                  status={task.status}
                  interactive
                  onChange={(s) => onStatusChange(task.id, s)}
                />
              </TableCell>
              <TableCell align="right">
                <IconButton size="small" onClick={() => onMarkDone(task.id)} title="标记完成">
                  <DoneIcon fontSize="small" sx={{ color: dt.success.main }} />
                </IconButton>
                <IconButton size="small" onClick={() => onEdit(task)} title="编辑">
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => onDelete(task.id)} title="删除" sx={{ color: dt.danger.main }}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
