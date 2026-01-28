'use client';

import { format, isToday, isWithinInterval, addDays } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Box,
  Typography,
  Select,
  MenuItem,
  Chip
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as DoneIcon
} from '@mui/icons-material';
import { TaskStatus } from '@prisma/client';

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: TaskStatus;
  assignee: { id: string; name: string } | null;
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
  onMarkDone
}: TaskTableProps) {
  const isOverdue = (dueDate: string | null, status: TaskStatus) => {
    if (!dueDate || status === 'DONE' || status === 'CANCELLED') {
      return false;
    }

    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    return taskDate < today;
  };

  /**
   * Get row background color based on due date
   * Visual hierarchy:
   * - Overdue (past due): Dark red (#ffcdd2) + "逾期" chip
   * - Due today: Light red (#ffebee)
   * - Due within 2 days: Orange (#ffe0b2)
   * - Due within 7 days: Yellow (#fff9c4)
   * - Other tasks: Transparent
   */
  const getRowColor = (dueDate: string | null, status: TaskStatus) => {
    if (!dueDate) return 'transparent';

    // Don't highlight completed or cancelled tasks
    if (status === 'DONE' || status === 'CANCELLED') {
      return 'transparent';
    }

    const date = new Date(dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    // Overdue tasks (past due date) - darker red
    if (taskDate < today) {
      return '#ffcdd2'; // Stronger red for overdue
    }

    // Due today - light red
    if (isToday(date)) {
      return '#ffebee';
    }

    // Due within 2 days (tomorrow or day after) - orange
    const twoDaysLater = addDays(today, 2);
    if (isWithinInterval(date, { start: addDays(today, 1), end: twoDaysLater })) {
      return '#ffe0b2'; // Orange background
    }

    // Due within 7 days (3-7 days) - yellow
    const sevenDaysLater = addDays(today, 7);
    if (isWithinInterval(date, { start: addDays(today, 3), end: sevenDaysLater })) {
      return '#fff9c4'; // Yellow background
    }

    return 'transparent';
  };

  if (tasks.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">
          📋
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
          暂无任务
        </Typography>
        <Typography variant="body2" color="text.secondary">
          点击"添加任务"开始使用
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
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
              <TableCell>{task.title}</TableCell>
              <TableCell>{task.assignee?.name || '-'}</TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <span>
                    {task.dueDate
                      ? format(new Date(task.dueDate), 'yyyy-MM-dd HH:mm')
                      : '-'}
                  </span>
                  {isOverdue(task.dueDate, task.status) && (
                    <Chip
                      label="逾期"
                      color="error"
                      size="small"
                      sx={{ fontWeight: 'bold' }}
                    />
                  )}
                </Box>
              </TableCell>
              <TableCell>
                <Select
                  value={task.status}
                  onChange={(e) =>
                    onStatusChange(task.id, e.target.value as TaskStatus)
                  }
                  size="small"
                  variant="standard"
                >
                  <MenuItem value="TODO">待办</MenuItem>
                  <MenuItem value="IN_PROGRESS">进行中</MenuItem>
                  <MenuItem value="DONE">已完成</MenuItem>
                  <MenuItem value="CANCELLED">已取消</MenuItem>
                  <MenuItem value="POSTPONED">已推迟</MenuItem>
                </Select>
              </TableCell>
              <TableCell align="right">
                <IconButton
                  size="small"
                  onClick={() => onMarkDone(task.id)}
                  title="标记完成"
                >
                  <DoneIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onEdit(task)}
                  title="编辑"
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onDelete(task.id)}
                  title="删除"
                  color="error"
                >
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
