'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Group as GroupIcon } from '@mui/icons-material';

interface Template {
  id: string;
  name: string;
  description: string;
  scenario: string;
  roles: Array<{ name: string }>;
}

interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  selectedId?: string;
}

export default function TemplateSelector({ onSelect, selectedId }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/roundtable/templates?enabled=true');
      if (!res.ok) throw new Error('Failed to fetch templates');
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
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
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Grid container spacing={2}>
      {templates.map((template) => (
        <Grid item xs={12} sm={6} md={4} key={template.id}>
          <Card
            sx={{
              cursor: 'pointer',
              border: selectedId === template.id ? 2 : 0,
              borderColor: 'primary.main',
              '&:hover': { boxShadow: 3 },
            }}
            onClick={() => onSelect(template)}
          >
            <CardContent>
              <Typography variant="h6" gutterBottom>
                {template.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 60 }}>
                {template.description}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <GroupIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  {template.roles.length} 个角色
                </Typography>
              </Box>
              {template.scenario && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                  {template.scenario}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}
