import React from "react";
import BrokerTutorialClient from "./BrokerTutorialClient";

export default async function BrokerTutorialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolved = await searchParams;
  const printParam = Array.isArray(resolved?.print) ? resolved.print[0] : resolved?.print;
  return <BrokerTutorialClient isPrintMode={printParam === "1"} />;
}
