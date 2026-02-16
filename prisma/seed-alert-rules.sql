INSERT INTO "AlertRule" (id, keyword, "signalType", severity, "isSystem", "isEnabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.keyword, v.type, v.severity, true, true, now(), now()
FROM (VALUES
  ('CRITICAL', 'RISK', 'CRITICAL'),
  ('严重', 'RISK', 'CRITICAL'),
  ('崩溃', 'RISK', 'CRITICAL'),
  ('宕机', 'RISK', 'CRITICAL'),
  ('故障', 'RISK', 'CRITICAL'),
  ('事故', 'RISK', 'CRITICAL'),
  ('报警', 'RISK', 'HIGH'),
  ('异常', 'RISK', 'HIGH'),
  ('风险', 'RISK', 'HIGH'),
  ('警告', 'RISK', 'HIGH'),
  ('告警', 'RISK', 'HIGH'),
  ('延期', 'BLOCKER', 'MEDIUM'),
  ('卡住', 'BLOCKER', 'MEDIUM'),
  ('阻塞', 'BLOCKER', 'MEDIUM'),
  ('等待审批', 'BLOCKER', 'MEDIUM'),
  ('搞不定', 'BLOCKER', 'MEDIUM'),
  ('无法推进', 'BLOCKER', 'MEDIUM'),
  ('紧急', 'ESCALATION', 'HIGH'),
  ('急需', 'ESCALATION', 'HIGH'),
  ('尽快处理', 'ESCALATION', 'HIGH'),
  ('升级处理', 'ESCALATION', 'HIGH')
) AS v(keyword, type, severity)
WHERE NOT EXISTS (SELECT 1 FROM "AlertRule" WHERE "isSystem" = true LIMIT 1);
