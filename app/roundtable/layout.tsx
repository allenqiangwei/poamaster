import { Box, Container } from '@mui/material';

export default function RoundtableLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      {children}
    </Container>
  );
}
