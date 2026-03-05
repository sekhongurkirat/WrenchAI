export type AnalysisResult = {
  step: number;
  totalSteps: number;
  instruction: string;
  highlight: string | null;
  highlightLabel: string | null;
  safetyWarning: string | null;
  done: boolean;
  nextAction: string;
};

export type HistoryEntry = {
  image: string | null; // base64 (compressed)
  result: AnalysisResult;
};
