"use client";

import dynamic from "next/dynamic";
import type { QaFeedbackPinWidgetProps } from "./QaFeedbackPinWidget";

const DynamicQaFeedbackPinWidget = dynamic(
  () =>
    import("@/components/workspace/QaFeedbackPinWidget").then(
      (m) => m.QaFeedbackPinWidget
    ),
  { ssr: false, loading: () => null }
);

export function LazyQaFeedbackPinWidget(props: QaFeedbackPinWidgetProps) {
  return <DynamicQaFeedbackPinWidget {...props} />;
}
