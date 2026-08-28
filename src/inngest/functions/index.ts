import { gmailSync } from './gmail-sync';
import { masterDataSync } from './master-data-sync';
import { processLead } from './process-lead';
import { gmailSyncSchedule, masterDataSyncSchedule } from './schedules';

export const functions = [
  gmailSync,
  masterDataSync,
  processLead,
  gmailSyncSchedule,
  masterDataSyncSchedule,
];
