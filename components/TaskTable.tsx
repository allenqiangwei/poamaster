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
  MenuItem
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
  const getRowColor = (dueDate: string | null) => {
    if (!dueDate) return 'transparent';

    const date = new Date(dueDate);
    const today = new Date();
    const sevenDaysLater = addDays(today, 7);

    if (isToday(date)) {
      return '#ffebee'; // 红色背景
    }

    if (isWithinInterval(date, { start: today, end: sevenDaysLater })) {
      return '#fff9c4'; // 黄色背景
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
              sx={{ bgcolor: getRowColor(task.dueDate) }}
            >
              <TableCell>{task.title}</TableCell>
              <TableCell>{task.assignee?.name || '-'}</TableCell>
              <TableCell>
                {task.dueDate
                  ? format(new Date(task.dueDate), 'yyyy-MM-dd HH:mm')
                  : '-'}
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
