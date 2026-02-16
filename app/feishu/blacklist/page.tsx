'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FeishuBlacklistRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/feishu/alerts?tab=blacklist');
  }, [router]);
  return null;
}
