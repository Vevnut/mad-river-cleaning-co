import { useQuery } from "@tanstack/react-query";
import type { Job, Staff } from "@shared/schema";
import type { JobAssignment } from "@shared/subcontractors";

type Assignment = NonNullable<JobAssignment>;

/** Who's on each job: the staff member, the subcontractor, or both. */
export function useJobCrew() {
  const { data: staffList = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: assignments = [] } = useQuery<Assignment[]>({ queryKey: ["/api/job-subcontractors"] });
  const subByJob = new Map(assignments.map(a => [a.jobId, a]));
  const staffOf = (job: Pick<Job, "assignedStaffId">) => staffList.find(s => s.id === job.assignedStaffId);
  const subOf = (job: Pick<Job, "id">) => subByJob.get(job.id);
  const crewName = (job: Pick<Job, "id" | "assignedStaffId">) => {
    const names = [staffOf(job)?.name, subOf(job) && `${subOf(job)!.subcontractorName} (sub)`].filter(Boolean);
    return names.length ? names.join(" + ") : "Unassigned";
  };
  /** Filter value: "all", a staff id, or "sub:<id>". */
  const matches = (job: Pick<Job, "id" | "assignedStaffId">, filter: string) =>
    filter === "all" || (filter.startsWith("sub:") ? String(subOf(job)?.subcontractorId) === filter.slice(4) : String(job.assignedStaffId) === filter);
  return { staffOf, subOf, crewName, matches };
}

export const refreshJobCrew = (qc: { invalidateQueries: (o: { queryKey: unknown[] }) => unknown }) =>
  qc.invalidateQueries({ queryKey: ["/api/job-subcontractors"] });
