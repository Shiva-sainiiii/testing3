import { AuditView } from "./AuditView";

// Append-only audit log (DEMO: public so judges can see it; production: DHO/admin only).
export default function AuditPage() {
  return <AuditView />;
}
