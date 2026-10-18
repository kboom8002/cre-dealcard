import React from "react";
import { BrokerSeniorLayout } from "@/components/layout/BrokerSeniorLayout";

export default function BrokerGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BrokerSeniorLayout>{children}</BrokerSeniorLayout>;
}
