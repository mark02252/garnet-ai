import { toast } from 'sonner';

export function showSuccess(message: string) { toast.success(message); }
export function showError(message: string) { toast.error(message); }
export function showInfo(message: string) { toast.info(message); }
export function showJobComplete(jobName: string, ok: boolean) {
  if (ok) toast.success(`${jobName} 완료`);
  else toast.error(`${jobName} 실패`);
}
