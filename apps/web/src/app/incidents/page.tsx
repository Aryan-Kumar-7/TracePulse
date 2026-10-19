'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/layout/Navbar';
import { IncidentList } from '@/components/incident/IncidentList';
import { api } from '@/lib/api';
import type { Incident } from '@/lib/types';

function IncidentsContent() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchIncidents = async () => {
    try {
      setIsLoading(true);
      const data = await api.getIncidents({ limit: 50 });
      setIncidents(data);
    } catch (err) {
      console.error('Failed to fetch incidents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleViewTrace = (traceId: string) => {
    router.push(`/traces?id=${encodeURIComponent(traceId)}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#090d16] text-gray-200">
      <Navbar activeTab="incidents" />
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full">
        <IncidentList
          incidents={incidents}
          onRefresh={fetchIncidents}
          onViewTrace={handleViewTrace}
        />
      </main>
    </div>
  );
}

export default function IncidentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-gray-400 text-xs">
          Loading Incident Center...
        </div>
      }
    >
      <IncidentsContent />
    </Suspense>
  );
}
