'use client';
import React from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  // Supabase auth doesn't require a provider wrapper - auth state is managed per-component
  return <>{children}</>;
}



