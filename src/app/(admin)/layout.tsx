import React from "react";
import { requireAdminRsc } from "@/lib/auth/require-admin-rsc";

export default async function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminRsc();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {children}
    </div>
  );
}
