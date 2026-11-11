import { RecognitionScreen } from "@/features/teams/recognition/recognition-screen";

// Localised from the preferences cookie, like every shell route: opt out of
// instant validation (see the root layout).
export const instant = false;

/** TM-10 · Thanks & feedback: /teams/[id]/recognition, inside the team gate. */
export default function TeamRecognitionPage() {
  return <RecognitionScreen />;
}
