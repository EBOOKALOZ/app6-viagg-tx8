import { useQuery } from "@tanstack/react-query";
import { listAuditLog } from "@/services/convenio/auditLog";

export function useConvenioAuditLog(page: number) {
  return useQuery({
    queryKey: ["convenio", "audit-log", page],
    queryFn: () => listAuditLog(page),
    staleTime: 15 * 1000,
  });
}
