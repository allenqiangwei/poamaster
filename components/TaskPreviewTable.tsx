'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  IconButton,
  Checkbox
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { ExtractedTask } from '@/lib/openai';

interface TaskPreviewTableProps {
  tasks: ExtractedTask[];
  onChange: (tasks: ExtractedTask[]) => void;
}

export default function TaskPreviewTable({
  tasks,
  onChange
}: TaskPreviewTableProps) {
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

  return (
    <TableContainer component={Paper}>
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
                  onChange={(e) =>
                    handleFieldChange(index, 'title', e.target.value)
                  }
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  value={task.assignee || ''}
                  onChange={(e) =>
                    handleFieldChange(
                      index,
                      'assignee',
                      e.target.value || null
                    )
                  }
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  type="date"
                  value={task.dueDate || ''}
                  onChange={(e) =>
                    handleFieldChange(
                      index,
                      'dueDate',
                      e.target.value || null
                    )
                  }
                  size="small"
                  fullWidth
                />
              </TableCell>
              <TableCell>
                <TextField
                  value={task.dod || ''}
                  onChange={(e) =>
                    handleFieldChange(index, 'dod', e.target.value || null)
                  }
                  size="small"
                  fullWidth
                  multiline
                />
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  onClick={() => handleDelete(index)}
                  color="error"
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
