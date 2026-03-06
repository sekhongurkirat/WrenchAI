export type OverlayType = "press" | "pull" | "lift" | "twist" | "unclip" | "point" | null;
export type Direction = "up" | "down" | "left" | "right" | "clockwise" | "counterclockwise" | null;

export type AnalysisResult = {
  step: number;
  totalSteps: number;
  instruction: string;
  highlight: string | null;
  highlightLabel: string | null;
  overlayType: OverlayType;
  direction: Direction;
  stepComplete: boolean; // true if AI sees the previous step was finished
  safetyWarning: string | null;
  done: boolean;
  nextAction: string;
};

export type HistoryEntry = {
  image: string | null;
  result: AnalysisResult;
};
