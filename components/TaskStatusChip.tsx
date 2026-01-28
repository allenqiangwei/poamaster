import { Chip } from '@mui/material';
import { TaskStatus } from '@prisma/client';

const STATUS_CONFIG = {
  TODO: { label: '待办', color: 'default' as const },
  IN_PROGRESS: { label: '进行中', color: 'primary' as const },
  DONE: { label: '已完成', color: 'success' as const },
  CANCELLED: { label: '已取消', color: 'error' as const },
  POSTPONED: { label: '已推迟', color: 'warning' as const }
};

interface TaskStatusChipProps {
  status: TaskStatus;
}

export default function TaskStatusChip({ status }: TaskStatusChipProps) {
  const config = STATUS_CONFIG[status];
  return <Chip label={config.label} color={config.color} size="small" />;
}
