import { useEffect, useRef } from "react";
import { useSurvey, SurveyConfig } from "@/components/feedback/SurveyProvider";

export function useSurveyTrigger(
  config: SurveyConfig,
  triggerCondition: boolean,
  delayMs: number = 2000
) {
  const { triggerSurvey } = useSurvey();
  const triggered = useRef(false);

  useEffect(() => {
    if (triggerCondition && !triggered.current) {
      triggered.current = true;
      const timer = setTimeout(() => {
        triggerSurvey(config);
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, [triggerCondition, config, delayMs, triggerSurvey]);
}
