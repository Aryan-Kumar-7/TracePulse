'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { TraceExplorer } from '@/components/trace/TraceExplorer';

function TracesContent() {
  const searchParams = useSearchParams();
  const traceId = searchParams?.get('id') || searchParams?.get('traceId') || null;

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-gray-200">
      <Navbar activeTab="traces" />
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
        <TraceExplorer initialTraceId={traceId} />
      </main>
    </div>
  );
}

export default function TracesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-gray-400 text-xs">
          Loading Trace Explorer...
        </div>
      }
    >
      <TracesContent />
    </Suspense>
  );
}
