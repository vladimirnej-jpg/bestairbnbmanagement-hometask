export interface ShowcaseContent {
  readonly subject: string;
  readonly greeting: string;
  readonly propertySummary: string;
  readonly selectedServices: readonly string[];
  readonly observations: readonly string[];
  readonly callToAction: string;
  readonly masterDataWarning?: string;
}
