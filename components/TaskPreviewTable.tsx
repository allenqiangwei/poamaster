'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Box,
  Card,
  CardContent,
  Typography,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { ExtractedTask } from '@/lib/openai';
import { designTokens as dt } from '@/lib/theme';
import { useResponsive } from '@/hooks/useResponsive';

interface TaskPreviewTableProps {
  tasks: ExtractedTask[];
  onChange: (tasks: ExtractedTask[]) => void;
}

export default function TaskPreviewTable({
  tasks,
  onChange,
}: TaskPreviewTableProps) {
  const { isMobile } = useResponsive();

  const handleFieldChange = (
    index: number,
    field: keyof ExtractedTask,
    value: string | null
  ) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    onChange(newTasks);
  };

  const handleDelete = (index: number) => {
    const newTasks = tasks.filter((_, i) => i !== index);
    onChange(newTasks);
  };

  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {tasks.map((task, index) => (
          <Card key={index} variant="outlined">
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Typography variant="caption" sx={{ color: dt.text.muted }}>
                  任务 {index + 1}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => handleDelete(index)}
                  sx={{ color: dt.danger.main }}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField
                  label="任务标题"
                  value={task.title}
                  onChange={(e) => handleFieldChange(index, 'title', e.target.value)}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="负责人"
                  value={task.assignee || ''}
                  onChange={(e) => handleFieldChange(index, 'assignee', e.target.value || null)}
                  size="small"
                  fullWidth
                />
                <TextField
                  label="截止时间"
                  type="date"
                  value={task.dueDate || ''}
                  onChange={(e) => handleFieldChange(index, 'dueDate', e.target.value || null)}
                  size="small"
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="DoD"
                  value={task.dod || ''}
                  onChange={(e) => handleFieldChange(index, 'dod', e.target.value || null)}
                  size="small"
                  fullWidth
                  multiline
                />
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
            <TableCell>DoD</TableCell>
            <TableCell>操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {tasks.map((task, index) => (
            <TableRow key={index}>
              <TableCell>
                <TextField
                  value={task.title}
                  onChange={(e) => handleFieldChange(index, 'title', e.target.value)}
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  value={task.assignee || ''}
                  onChange={(e) => handleFieldChange(index, 'assignee', e.target.value || null)}
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  type="date"
                  value={task.dueDate || ''}
                  onChange={(e) => handleFieldChange(index, 'dueDate', e.target.value || null)}
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  value={task.dod || ''}
                  onChange={(e) => handleFieldChange(index, 'dod', e.target.value || null)}
                  size="small"
                  fullWidth
                  multiline
                />
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  onClick={() => handleDelete(index)}
                  sx={{ color: dt.danger.main }}
                >
                  <DeleteIcon />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
