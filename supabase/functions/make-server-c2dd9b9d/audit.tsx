// Audit logging helper for security-sensitive privileged actions.
//
// Writes append-only rows to the `audit_log` table (see
// supabase/migrations/20260701000004_audit_log.sql) using the service-role
// Supabase client already used by the rest of the edge function. Failures to
// write an audit entry are logged but never thrown, so a logging problem can
// never block the underlying action from completing.
import { createClient } from 'npm:@supabase/supabase-js@2';

let auditClient: ReturnType<typeof createClient> | null = null;

function getAuditClient() {
  if (!auditClient) {
    auditClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return auditClient;
}

export interface AuditActor {
  id?: string | null;
  email?: string | null;
  role?: string | null;
}

export interface AuditEntry {
  action: string;
  actor?: AuditActor | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string | null;
}

// Records a privileged action to the audit log. Never throws -- errors are
// caught and logged so that audit logging can never break the calling route.
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const client = getAuditClient();
    const { error } = await client.from('audit_log').insert({
      actor_user_id: entry.actor?.id ?? null,
      actor_email: entry.actor?.email ?? null,
      actor_role: entry.actor?.role ?? null,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      details: entry.details ?? null,
      ip_address: entry.ipAddress ?? null,
    });
    if (error) {
      console.error('❌ Failed to write audit log entry:', entry.action, error.message);
    }
  } catch (error) {
    console.error('❌ Unexpected error writing audit log entry:', entry.action, error);
  }
}

// Best-effort extraction of the caller's IP address from common proxy headers.
export function extractClientIp(c: any): string | null {
  return (
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    c.req.header('X-Real-IP') ||
    null
  );
}
